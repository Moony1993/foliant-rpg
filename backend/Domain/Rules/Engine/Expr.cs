using System.Globalization;

namespace Foliant.Api.Domain.Rules.Engine;

/// <summary>Error in a rule package formula — message points at the formula and position.</summary>
public class RuleException(string message) : Exception(message);

/// <summary>What a formula can see: named values ("level", "armor.type", "save.Fort") and functions.</summary>
public interface IExprScope
{
    /// <summary>Value of an identifier, or null if unknown.</summary>
    object? Resolve(string name);
    /// <summary>Calls a whitelisted function; throws RuleException for unknown ones.</summary>
    object? Call(string name, object?[] args);
}

/// <summary>
/// The formula language of rule packages: numbers, 'strings' or "strings", true/false, + - * / %,
/// == != &lt; &lt;= &gt; &gt;=, &amp;&amp; || !, a ? b : c, (…), identifiers with dots and f(…) calls.
/// No loops, no assignment, no host access — evaluation always terminates. Parsed once, evaluated often.
/// </summary>
public sealed class Expr
{
    public const int MaxLength = 2000;
    private const int MaxDepth = 48;

    public string Source { get; }
    private readonly Node _root;
    /// <summary>Identifiers the formula reads (for dependency checks).</summary>
    public IReadOnlySet<string> Identifiers { get; }
    /// <summary>Functions the formula calls with their literal first argument, e.g. ("skill", "perception").</summary>
    public IReadOnlyList<(string Function, string? Arg)> Calls { get; }

    private Expr(string source, Node root, HashSet<string> ids, List<(string, string?)> calls)
    {
        Source = source; _root = root; Identifiers = ids; Calls = calls;
    }

    public static Expr Parse(string source)
    {
        if (string.IsNullOrWhiteSpace(source)) throw new RuleException("Empty formula.");
        if (source.Length > MaxLength) throw new RuleException($"Formula longer than {MaxLength} characters.");
        var p = new Parser(source);
        var root = p.ParseTernary(0);
        p.ExpectEnd();
        return new Expr(source, root, p.Ids, p.Calls);
    }

    public object? Evaluate(IExprScope scope)
    {
        try { return _root.Eval(scope); }
        catch (RuleException ex) { throw new RuleException($"{ex.Message} (in \"{Source}\")"); }
    }

    public double EvaluateNumber(IExprScope scope) => ToNumber(Evaluate(scope), Source);
    public bool EvaluateBool(IExprScope scope) => ToBool(Evaluate(scope));

    // ── values ───────────────────────────────────────────────────────────────
    /// <summary>A value as text: whole numbers without decimals.</summary>
    public static string Show(object? v) => v switch
    {
        double d => d.ToString(d == Math.Floor(d) ? "0" : "0.##", System.Globalization.CultureInfo.InvariantCulture),
        bool b => b ? "ja" : "nein",
        _ => v?.ToString() ?? "",
    };

    public static double ToNumber(object? v, string ctx = "") => v switch
    {
        double d => d,
        int i => i,
        bool b => b ? 1 : 0,
        null => 0,
        _ => throw new RuleException($"Number expected, but got \"{v}\"{(ctx.Length > 0 ? $" (in \"{ctx}\")" : "")}."),
    };

    public static bool ToBool(object? v) => v switch
    {
        bool b => b,
        double d => d != 0,
        int i => i != 0,
        string s => s.Length > 0,
        _ => false,
    };

    // A missing value (unknown fact) behaves like 0 next to a number and like '' next to text —
    // the same as in arithmetic, so "item.ArmorBonus == 0" holds when the character has no armor.
    private static bool Eq(object? a, object? b) => (a, b) switch
    {
        (string x, string y) => string.Equals(x, y, StringComparison.OrdinalIgnoreCase),
        (null, null) => true,
        (null, string y) => y.Length == 0,
        (string x, null) => x.Length == 0,
        (string, _) or (_, string) => false,
        _ => ToNumber(a) == ToNumber(b),
    };

    // ── AST ──────────────────────────────────────────────────────────────────
    private abstract record Node { public abstract object? Eval(IExprScope s); }
    private sealed record Lit(object? Value) : Node { public override object? Eval(IExprScope s) => Value; }
    private sealed record Id(string Name) : Node { public override object? Eval(IExprScope s) => s.Resolve(Name); }
    private sealed record Not(Node A) : Node { public override object? Eval(IExprScope s) => !ToBool(A.Eval(s)); }
    private sealed record Neg(Node A) : Node { public override object? Eval(IExprScope s) => -ToNumber(A.Eval(s)); }
    private sealed record Cond(Node Test, Node Then, Node Else) : Node
    {
        public override object? Eval(IExprScope s) => ToBool(Test.Eval(s)) ? Then.Eval(s) : Else.Eval(s);
    }
    private sealed record Call(string Name, Node[] Args) : Node
    {
        public override object? Eval(IExprScope s) => s.Call(Name, Args.Select(a => a.Eval(s)).ToArray());
    }
    private sealed record Bin(string Op, Node A, Node B) : Node
    {
        public override object? Eval(IExprScope s)
        {
            switch (Op)
            {
                case "&&": return ToBool(A.Eval(s)) && ToBool(B.Eval(s));
                case "||": return ToBool(A.Eval(s)) || ToBool(B.Eval(s));
            }
            var a = A.Eval(s); var b = B.Eval(s);
            switch (Op)
            {
                case "==": return Eq(a, b);
                case "!=": return !Eq(a, b);
            }
            if (Op == "+" && (a is string || b is string)) return Show(a) + Show(b);   // text joining
            double x = ToNumber(a), y = ToNumber(b);
            return Op switch
            {
                "+" => x + y, "-" => x - y, "*" => x * y,
                "/" => y == 0 ? throw new RuleException("Division by zero.") : x / y,
                "%" => y == 0 ? throw new RuleException("Division by zero.") : x % y,
                "<" => x < y, "<=" => x <= y, ">" => x > y, ">=" => x >= y,
                _ => throw new RuleException($"Unknown operator {Op}."),
            };
        }
    }

    // ── parser (precedence climbing) ─────────────────────────────────────────
    private sealed class Parser(string src)
    {
        private int _pos;
        private int _depth;
        public readonly HashSet<string> Ids = new(StringComparer.OrdinalIgnoreCase);
        public readonly List<(string, string?)> Calls = new();

        private static readonly (string Op, int Prec)[] Binary =
        {
            ("||", 1), ("&&", 2), ("==", 3), ("!=", 3), ("<=", 4), (">=", 4), ("<", 4), (">", 4),
            ("+", 5), ("-", 5), ("*", 6), ("/", 6), ("%", 6),
        };

        private RuleException Error(string msg) => new($"{msg} at position {_pos + 1} in \"{src}\".");

        private void Skip() { while (_pos < src.Length && char.IsWhiteSpace(src[_pos])) _pos++; }
        private bool Peek(string s) { Skip(); return string.CompareOrdinal(src, _pos, s, 0, s.Length) == 0; }
        private bool Take(string s) { if (!Peek(s)) return false; _pos += s.Length; return true; }

        public void ExpectEnd() { Skip(); if (_pos < src.Length) throw Error($"Unexpected \"{src[_pos]}\""); }

        public Node ParseTernary(int _)
        {
            if (++_depth > MaxDepth) throw Error("Formula nested too deeply");
            var test = ParseBinary(1);
            if (Take("?"))
            {
                var then = ParseTernary(0);
                if (!Take(":")) throw Error("\":\" expected");
                var @else = ParseTernary(0);
                _depth--;
                return new Cond(test, then, @else);
            }
            _depth--;
            return test;
        }

        private Node ParseBinary(int minPrec)
        {
            var left = ParseUnary();
            while (true)
            {
                Skip();
                var op = Binary.FirstOrDefault(o => o.Prec >= minPrec && string.CompareOrdinal(src, _pos, o.Op, 0, o.Op.Length) == 0
                    // "<" must not eat the first char of "<="; same for ">", "!".
                    && !(o.Op.Length == 1 && _pos + 1 < src.Length && src[_pos + 1] == '=' && "<>!=".Contains(o.Op)));
                if (op.Op == null) return left;
                _pos += op.Op.Length;
                var right = ParseBinary(op.Prec + 1);
                left = new Bin(op.Op, left, right);
            }
        }

        private Node ParseUnary()
        {
            if (++_depth > MaxDepth) throw Error("Formula nested too deeply");
            try
            {
                if (Take("!")) return new Not(ParseUnary());
                if (Take("-")) return new Neg(ParseUnary());
                return ParsePrimary();
            }
            finally { _depth--; }
        }

        private Node ParsePrimary()
        {
            Skip();
            if (_pos >= src.Length) throw Error("Expression expected");
            char c = src[_pos];
            if (Take("("))
            {
                var inner = ParseTernary(0);
                if (!Take(")")) throw Error("\")\" expected");
                return inner;
            }
            if (c is '\'' or '"')   // 'text' or "text" (the other quote may appear inside)
            {
                int end = src.IndexOf(c, _pos + 1);
                if (end < 0) throw Error("Text not closed");
                var text = src.Substring(_pos + 1, end - _pos - 1);
                _pos = end + 1;
                return new Lit(text);
            }
            if (char.IsDigit(c))
            {
                int start = _pos;
                while (_pos < src.Length && (char.IsDigit(src[_pos]) || src[_pos] == '.')) _pos++;
                if (!double.TryParse(src[start.._pos], NumberStyles.Float, CultureInfo.InvariantCulture, out var n)) throw Error("Invalid number");
                return new Lit(n);
            }
            if (char.IsLetter(c) || c == '_')
            {
                int start = _pos;
                while (_pos < src.Length && (char.IsLetterOrDigit(src[_pos]) || src[_pos] is '_' or '.')) _pos++;
                var name = src[start.._pos].TrimEnd('.');
                _pos = start + name.Length;
                if (name.Equals("true", StringComparison.OrdinalIgnoreCase)) return new Lit(true);
                if (name.Equals("false", StringComparison.OrdinalIgnoreCase)) return new Lit(false);
                if (Take("("))
                {
                    var args = new List<Node>();
                    if (!Take(")"))
                    {
                        do args.Add(ParseTernary(0)); while (Take(","));
                        if (!Take(")")) throw Error("\")\" expected");
                    }
                    Calls.Add((name.ToLowerInvariant(), args.Count > 0 && args[0] is Lit { Value: string s } ? s : null));
                    return new Call(name.ToLowerInvariant(), args.ToArray());
                }
                Ids.Add(name);
                return new Id(name);
            }
            throw Error($"Unexpected \"{c}\"");
        }
    }
}
