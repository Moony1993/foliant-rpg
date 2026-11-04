using System.Collections.Concurrent;

namespace Foliant.Api.Domain.Rules;

/// <summary>The rule system id isn't installed (e.g. a package that no longer loads).</summary>
public class RuleSystemMissingException(string id)
    : Exception($"The rule system \"{id}\" is not installed. An admin has to install it under rule systems.");

/// <summary>Resolves a rule system by id. Rule packages are registered at startup and added/removed at runtime
/// when the admin installs or removes them; tests may pass fixed (built-in) systems.</summary>
public class RuleSystemRegistry
{
    private readonly ConcurrentDictionary<string, IRuleSystem> _systems = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _builtIn = new(StringComparer.OrdinalIgnoreCase);

    public RuleSystemRegistry(IEnumerable<IRuleSystem> builtIn)
    {
        foreach (var s in builtIn) { _systems[s.Id] = s; _builtIn.Add(s.Id); }
    }

    public IRuleSystem For(string? id) =>
        id != null && _systems.TryGetValue(id, out var s) ? s : throw new RuleSystemMissingException(id ?? "");

    public bool Has(string id) => _systems.ContainsKey(id);
    public bool IsBuiltIn(string id) => _builtIn.Contains(id);

    public IEnumerable<IRuleSystem> All => _systems.Values.OrderBy(s => !_builtIn.Contains(s.Id)).ThenBy(s => s.DisplayName);

    /// <summary>Adds or replaces a package system. Built-in ids can't be replaced.</summary>
    public void Register(IRuleSystem system)
    {
        if (_builtIn.Contains(system.Id)) throw new InvalidOperationException($"\"{system.Id}\" is a built-in system.");
        _systems[system.Id] = system;
    }

    public void Remove(string id)
    {
        if (!_builtIn.Contains(id)) _systems.TryRemove(id, out _);
    }
}
