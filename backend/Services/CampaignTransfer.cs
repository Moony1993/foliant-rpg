using System.IO.Compression;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;

namespace Foliant.Api.Services;

/// <summary>
/// Campaign export/import as a <c>.foliant</c> file (ZIP): <c>manifest.json</c> + <c>campaign.json</c>
/// + <c>media/…</c>. Rows are written as plain property bags (every scalar column except keys and
/// owners), so new columns travel along without touching this code; ids are only kept as "_id" to
/// rewrite references on import, where everything gets fresh ids in a new campaign.
/// The file is untrusted input: sizes are capped, only known entries are read, media must be images.
/// </summary>
public class CampaignTransfer
{
    public const string Format = "foliant-campaign";
    public const int FormatVersion = 1;
    public const long MaxUpload = 200L * 1024 * 1024;
    private const long MaxJson = 50L * 1024 * 1024;
    private const long MaxMedia = 20L * 1024 * 1024;
    private const long MaxTotal = 600L * 1024 * 1024;
    private const int MaxRows = 20_000;
    private static readonly HashSet<string> ImageExt = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".webp", ".gif" };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Keys and owner columns never travel: they are re-assigned on import.
    private static readonly HashSet<string> Skip = new()
    {
        "Id", "CampaignId", "UserId", "CreatedByUserId", "CharacterId", "ItemTemplateId", "PollId", "OptionId", "RequiresSkillId",
    };

    private readonly AppDbContext _db;
    private readonly MediaStorage _media;
    private readonly RuleSystemRegistry _rules;

    public CampaignTransfer(AppDbContext db, MediaStorage media, RuleSystemRegistry rules)
    {
        _db = db; _media = media; _rules = rules;
    }

    // ── Property bags ────────────────────────────────────────────────────────
    private static bool IsScalar(Type t)
    {
        t = Nullable.GetUnderlyingType(t) ?? t;
        return t.IsPrimitive || t.IsEnum || t == typeof(string) || t == typeof(decimal) || t == typeof(DateTime) || t == typeof(Guid);
    }

    private static IEnumerable<PropertyInfo> Columns(Type t) =>
        t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead && p.CanWrite && IsScalar(p.PropertyType) && !Skip.Contains(p.Name));

    private static JsonObject Dump(object e, int? id = null)
    {
        var o = new JsonObject();
        if (id != null) o["_id"] = id;
        foreach (var p in Columns(e.GetType())) o[p.Name] = JsonSerializer.SerializeToNode(p.GetValue(e), p.PropertyType);
        return o;
    }

    /// <summary>Copies known columns; unknown or malformed values are ignored (older/newer exports).</summary>
    private static T Load<T>(JsonObject o) where T : new()
    {
        var e = new T();
        foreach (var p in Columns(typeof(T)))
        {
            if (!o.TryGetPropertyValue(p.Name, out var v) || v == null) continue;
            try { p.SetValue(e, v.Deserialize(p.PropertyType)); } catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException) { }
        }
        return e;
    }

    private static int? OldId(JsonObject o) => o["_id"]?.GetValue<int>();

    // ── Export ───────────────────────────────────────────────────────────────
    /// <param name="withCharacters">"Vollständiges Backup": characters (with inventory, spells, …) and their map tokens.</param>
    public async Task<(byte[] Zip, string FileName)> ExportAsync(int campaignId, string gmUserId, bool withCharacters, HttpRequest req)
    {
        var c = await _db.Campaigns.AsNoTracking().FirstAsync(x => x.Id == campaignId);
        var mediaFiles = new Dictionary<string, byte[]>();
        var mediaByUrl = new Dictionary<string, string>();
        async Task<string?> Media(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return url;
            if (mediaByUrl.TryGetValue(url, out var known)) return known;
            var file = await _media.TryReadAsync(url, req);
            if (file == null) return url;   // foreign URL: keep as is
            var entry = $"media/{mediaFiles.Count + 1}{file.Value.Extension.ToLowerInvariant()}";
            mediaFiles[entry] = file.Value.Data;
            return mediaByUrl[url] = entry;
        }

        IQueryable<T> Of<T>() where T : class, ICampaignOwned => _db.Set<T>().IgnoreQueryFilters().AsNoTracking().Where(e => e.CampaignId == campaignId);
        IQueryable<T> Brew<T>() where T : class, ICampaignLibrary => _db.Set<T>().IgnoreQueryFilters().AsNoTracking().Where(e => e.CampaignId == campaignId);

        var items = await Brew<ItemTemplate>().ToListAsync();
        var feats = await Brew<FeatTemplate>().ToListAsync();
        var spells = await Brew<CompendiumSpell>().ToListAsync();
        var monsters = await Of<Monster>().ToListAsync();
        var assets = await Of<MapAsset>().ToListAsync();
        var maps = await Of<BattleMap>().ToListAsync();
        var notes = await Of<Note>().Where(n => n.UserId == gmUserId).ToListAsync();   // only the GM's own notes
        var characters = withCharacters
            ? await Of<Character>().Include(x => x.Items).Include(x => x.SkillRanks).ToListAsync()
            : new List<Character>();
        var charIds = characters.Select(x => x.Id).ToList();
        var skills = await _db.Skills.AsNoTracking().Where(s => charIds.Contains(s.CharacterId)).ToListAsync();
        var charSpells = await _db.Spells.AsNoTracking().Where(s => charIds.Contains(s.CharacterId)).ToListAsync();
        var companions = await _db.Companions.AsNoTracking().Where(s => charIds.Contains(s.CharacterId)).ToListAsync();
        var statuses = await _db.StatusEffects.AsNoTracking().Where(s => charIds.Contains(s.CharacterId)).ToListAsync();

        // Official rows referenced by id get resolved by name on the target instance.
        var brewItemIds = items.Select(i => i.Id).ToHashSet();
        var refItemIds = characters.SelectMany(x => x.Items).Select(i => i.ItemTemplateId)
            .Concat(monsters.SelectMany(m => ReadIds(m.ItemTemplateIdsJson))).Where(id => !brewItemIds.Contains(id)).ToHashSet();
        var brewFeatIds = feats.Select(f => f.Id).ToHashSet();
        var refFeatIds = characters.SelectMany(x => ReadFeats(x.FeatsJson)).Select(f => f.Id).Where(id => !brewFeatIds.Contains(id)).ToHashSet();
        var officialItems = await _db.ItemTemplates.IgnoreQueryFilters().Where(t => t.CampaignId == null && refItemIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id.ToString(), t => t.Name);
        var officialFeats = await _db.Feats.IgnoreQueryFilters().Where(f => f.CampaignId == null && refFeatIds.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id.ToString(), f => f.Name);

        var mapNodes = new JsonArray();
        foreach (var m in maps)
        {
            var o = Dump(m, m.Id);
            o[nameof(BattleMap.ImageUrl)] = await Media(m.ImageUrl);
            var tokens = JsonNode.Parse(m.TokensJson) as JsonArray ?? new JsonArray();
            foreach (var t in tokens.OfType<JsonObject>().ToList())
            {
                // Without characters in the file their tokens would point nowhere.
                if (!withCharacters && (string?)t["kind"] == "character") { tokens.Remove(t); continue; }
                if (t["imageUrl"] is JsonValue v && v.TryGetValue<string>(out var url)) t["imageUrl"] = await Media(url);
            }
            o[nameof(BattleMap.TokensJson)] = tokens.ToJsonString();
            mapNodes.Add(o);
        }
        var assetNodes = new JsonArray();
        foreach (var a in assets)
        {
            var o = Dump(a, a.Id);
            o[nameof(MapAsset.ImageUrl)] = await Media(a.ImageUrl);
            assetNodes.Add(o);
        }
        var charNodes = new JsonArray();
        foreach (var ch in characters)
        {
            var o = Dump(ch, ch.Id);
            o[nameof(Character.PortraitUrl)] = await Media(ch.PortraitUrl);
            o["items"] = new JsonArray(ch.Items.Select(i => { var n = Dump(i); n["templateId"] = i.ItemTemplateId; return (JsonNode)n; }).ToArray());
            o["skillRanks"] = new JsonArray(ch.SkillRanks.Select(s => (JsonNode)Dump(s)).ToArray());
            o["skills"] = new JsonArray(skills.Where(s => s.CharacterId == ch.Id).Select(s => { var n = Dump(s, s.Id); n["requires"] = s.RequiresSkillId; return (JsonNode)n; }).ToArray());
            o["spells"] = new JsonArray(charSpells.Where(s => s.CharacterId == ch.Id).Select(s => (JsonNode)Dump(s, s.Id)).ToArray());
            o["companions"] = new JsonArray(companions.Where(s => s.CharacterId == ch.Id).Select(s => (JsonNode)Dump(s)).ToArray());
            o["statusEffects"] = new JsonArray(statuses.Where(s => s.CharacterId == ch.Id).Select(s => (JsonNode)Dump(s)).ToArray());
            charNodes.Add(o);
        }

        var campaign = new JsonObject
        {
            ["name"] = c.Name, ["description"] = c.Description, ["settingsJson"] = c.SettingsJson, ["imageUrl"] = await Media(c.ImageUrl),
            ["items"] = new JsonArray(items.Select(i => (JsonNode)Dump(i, i.Id)).ToArray()),
            ["feats"] = new JsonArray(feats.Select(f => (JsonNode)Dump(f, f.Id)).ToArray()),
            ["spells"] = new JsonArray(spells.Select(s => (JsonNode)Dump(s)).ToArray()),
            ["monsters"] = new JsonArray(monsters.Select(m => (JsonNode)Dump(m, m.Id)).ToArray()),
            ["mapAssets"] = assetNodes,
            ["maps"] = mapNodes,
            ["notes"] = new JsonArray(notes.Select(n => (JsonNode)Dump(n)).ToArray()),
            ["characters"] = charNodes,
            ["officialRefs"] = new JsonObject
            {
                ["items"] = JsonSerializer.SerializeToNode(officialItems),
                ["feats"] = JsonSerializer.SerializeToNode(officialFeats),
            },
        };
        var manifest = new JsonObject
        {
            ["format"] = Format, ["formatVersion"] = FormatVersion, ["variant"] = withCharacters ? "backup" : "template",
            ["ruleSystemId"] = c.RuleSystemId, ["exportedAt"] = DateTime.UtcNow, ["app"] = "Foliant",
            ["counts"] = new JsonObject
            {
                ["items"] = items.Count, ["feats"] = feats.Count, ["spells"] = spells.Count, ["monsters"] = monsters.Count,
                ["maps"] = maps.Count, ["mapAssets"] = assets.Count, ["notes"] = notes.Count, ["characters"] = characters.Count,
                ["media"] = mediaFiles.Count,
            },
        };

        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            async Task Write(string name, string text)
            {
                await using var w = new StreamWriter(zip.CreateEntry(name, CompressionLevel.Optimal).Open());
                await w.WriteAsync(text);
            }
            await Write("manifest.json", manifest.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            await Write("campaign.json", campaign.ToJsonString());
            foreach (var (name, data) in mediaFiles)
            {
                await using var s = zip.CreateEntry(name, CompressionLevel.NoCompression).Open();   // images are compressed already
                await s.WriteAsync(data);
            }
        }
        var safeName = string.Concat(c.Name.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')).Trim('-');
        return (ms.ToArray(), $"{(safeName.Length > 0 ? safeName : "kampagne")}{(withCharacters ? "-backup" : "")}.foliant");
    }

    private static List<int> ReadIds(string json)
    {
        try { return JsonSerializer.Deserialize<List<int>>(json) ?? new(); } catch (JsonException) { return new(); }
    }

    private static List<CharacterFeat> ReadFeats(string json)
    {
        try { return JsonSerializer.Deserialize<List<CharacterFeat>>(json, Json) ?? new(); } catch (JsonException) { return new(); }
    }

    // ── Import ───────────────────────────────────────────────────────────────
    public record ImportResult(int CampaignId, string Name, Dictionary<string, int> Counts, List<string> Warnings);

    public class ImportException(string message) : Exception(message);

    /// <summary>Creates a new campaign (the importer becomes its GM) from a .foliant file.</summary>
    public async Task<ImportResult> ImportAsync(Stream file, string importerId, string importerName, HttpRequest req)
    {
        using var zip = OpenZip(file);
        // Entry names are only used as lookup keys, never as file paths (no zip-slip).
        var entries = zip.Entries.GroupBy(e => e.FullName, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
        if (entries.Count > MaxRows) throw new ImportException("The file contains too many entries.");
        if (zip.Entries.Sum(e => e.Length) > MaxTotal) throw new ImportException("The file is too large when unpacked.");

        var manifest = ReadJson(entries, "manifest.json");
        if ((string?)manifest["format"] != Format) throw new ImportException("This is not a Foliant campaign file.");
        var version = manifest["formatVersion"]?.GetValue<int>() ?? 0;
        if (version < 1 || version > FormatVersion)
            throw new ImportException($"File format version {version} is not supported by this version of Foliant.");
        var system = (string?)manifest["ruleSystemId"] ?? "";
        if (_rules.All.All(s => s.Id != system))
            throw new ImportException($"The rule system \"{system}\" is not installed on this instance.");
        var data = ReadJson(entries, "campaign.json");
        JsonArray Arr(string key) => data[key] as JsonArray ?? new JsonArray();
        var warnings = new List<string>();

        var uploaded = new Dictionary<string, string>();
        async Task<string?> Media(string? value)
        {
            if (string.IsNullOrWhiteSpace(value) || !value.StartsWith("media/")) return value is null || value.StartsWith("http") ? value : null;
            if (uploaded.TryGetValue(value, out var url)) return url;
            var ext = Path.GetExtension(value);
            var bytes = entries.TryGetValue(value, out var entry) && ImageExt.Contains(ext) ? ReadBounded(entry, MaxMedia) : null;
            if (bytes == null)
            {
                warnings.Add($"Image {value} is missing or invalid.");
                return null;
            }
            using var buffer = new MemoryStream(bytes);
            var contentType = ext.ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", ".gif" => "image/gif", _ => "image/jpeg" };
            return uploaded[value] = await _media.SaveAsync(buffer, value, contentType, req);
        }

        await using var tx = await _db.Database.BeginTransactionAsync();

        var name = ((string?)data["name"])?.Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 100)] : "Imported campaign";
        var campaign = new Campaign
        {
            Name = name, Description = (string?)data["description"] ?? "", RuleSystemId = system, CreatedByUserId = importerId,
            SettingsJson = (string?)data["settingsJson"] ?? "{}", ImageUrl = await Media((string?)data["imageUrl"]),
            Members = { new CampaignMember { UserId = importerId, Role = CampaignRoles.Gm } },
        };
        _db.Campaigns.Add(campaign);
        await _db.SaveChangesAsync();
        var cid = campaign.Id;

        // Library homebrew first: everything else may point at it.
        var itemMap = new Dictionary<int, ItemTemplate>();
        foreach (var o in Arr("items").OfType<JsonObject>())
        {
            var t = Load<ItemTemplate>(o); t.CampaignId = cid; t.CreatedByUserId = importerId; t.RuleSystemId = system;
            _db.ItemTemplates.Add(t);
            if (OldId(o) is int old) itemMap[old] = t;
        }
        var featMap = new Dictionary<int, FeatTemplate>();
        foreach (var o in Arr("feats").OfType<JsonObject>())
        {
            var f = Load<FeatTemplate>(o); f.CampaignId = cid; f.CreatedByUserId = importerId; f.CreatedByName = importerName; f.RuleSystemId = system;
            _db.Feats.Add(f);
            if (OldId(o) is int old) featMap[old] = f;
        }
        foreach (var o in Arr("spells").OfType<JsonObject>())
        {
            var s = Load<CompendiumSpell>(o); s.CampaignId = cid; s.CreatedByUserId = importerId; s.CreatedByName = importerName; s.RuleSystemId = system;
            _db.CompendiumSpells.Add(s);
        }
        await _db.SaveChangesAsync();

        // Official rows referenced by the file, resolved by name here.
        var refs = data["officialRefs"] as JsonObject;
        var officialItemNames = refs?["items"]?.Deserialize<Dictionary<string, string>>() ?? new();
        var officialFeatNames = refs?["feats"]?.Deserialize<Dictionary<string, string>>() ?? new();
        var localItems = await _db.ItemTemplates.IgnoreQueryFilters().AsNoTracking().Where(t => t.CampaignId == null && t.RuleSystemId == system).ToListAsync();
        var localFeats = await _db.Feats.IgnoreQueryFilters().Where(f => f.CampaignId == null && f.RuleSystemId == system).Select(f => new { f.Id, f.Name }).ToListAsync();
        int? ItemId(int old)
        {
            if (itemMap.TryGetValue(old, out var t)) return t.Id;
            if (officialItemNames.TryGetValue(old.ToString(), out var n)
                && localItems.FirstOrDefault(x => string.Equals(x.Name, n, StringComparison.OrdinalIgnoreCase)) is { } local) return local.Id;
            warnings.Add($"Item #{old}{(officialItemNames.TryGetValue(old.ToString(), out var miss) ? $" \"{miss}\"" : "")} does not exist here — skipped.");
            return null;
        }
        int? FeatId(int old, string featName)
        {
            if (featMap.TryGetValue(old, out var f)) return f.Id;
            var wanted = officialFeatNames.GetValueOrDefault(old.ToString(), featName);
            if (localFeats.FirstOrDefault(x => string.Equals(x.Name, wanted, StringComparison.OrdinalIgnoreCase)) is { } local) return local.Id;
            warnings.Add($"Feat \"{wanted}\" does not exist here — skipped.");
            return null;
        }

        var monsterMap = new Dictionary<int, Monster>();
        foreach (var o in Arr("monsters").OfType<JsonObject>())
        {
            var m = Load<Monster>(o); m.CampaignId = cid; m.CreatedByUserId = importerId;
            m.ItemTemplateIdsJson = JsonSerializer.Serialize(ReadIds(m.ItemTemplateIdsJson).Select(ItemId).OfType<int>().ToList());
            _db.Monsters.Add(m);
            if (OldId(o) is int old) monsterMap[old] = m;
        }
        foreach (var o in Arr("mapAssets").OfType<JsonObject>())
        {
            var a = Load<MapAsset>(o); a.CampaignId = cid; a.CreatedByUserId = importerId; a.CreatedByName = importerName;
            a.ImageUrl = await Media(a.ImageUrl);
            _db.MapAssets.Add(a);
        }
        foreach (var o in Arr("notes").OfType<JsonObject>())
        {
            var note = Load<Note>(o); note.CampaignId = cid; note.UserId = importerId;
            _db.Notes.Add(note);
        }

        // Characters (backup only) belong to the importing GM; players can't be carried across instances.
        var charMap = new Dictionary<int, Character>();
        var pending = new List<(Character Ch, List<(Skill S, int? Requires, int? Old)> Skills, Dictionary<int, Spell> Spells)>();
        foreach (var o in Arr("characters").OfType<JsonObject>())
        {
            var ch = Load<Character>(o); ch.CampaignId = cid; ch.UserId = importerId;
            ch.PortraitUrl = await Media(ch.PortraitUrl);
            var feats = ReadFeats(ch.FeatsJson).Select(f => FeatId(f.Id, f.Name) is int id ? f with { Id = id } : null).OfType<CharacterFeat>().ToList();
            ch.FeatsJson = JsonSerializer.Serialize(feats, Json);
            ch.FeatIdsJson = JsonSerializer.Serialize(feats.Select(f => f.Id).Distinct().ToList());
            foreach (var io in (o["items"] as JsonArray ?? new()).OfType<JsonObject>())
            {
                if (io["templateId"]?.GetValue<int>() is not int oldT || ItemId(oldT) is not int newT) continue;
                var inv = Load<InventoryItem>(io); inv.ItemTemplateId = newT;
                ch.Items.Add(inv);
            }
            foreach (var so in (o["skillRanks"] as JsonArray ?? new()).OfType<JsonObject>()) ch.SkillRanks.Add(Load<CharacterSkill>(so));
            _db.Characters.Add(ch);

            var skills = (o["skills"] as JsonArray ?? new()).OfType<JsonObject>()
                .Select(so => (S: Load<Skill>(so), Requires: so["requires"]?.GetValue<int?>(), Old: OldId(so))).ToList();
            foreach (var s in skills) { s.S.Character = ch; _db.Skills.Add(s.S); }
            var spells = new Dictionary<int, Spell>();
            foreach (var so in (o["spells"] as JsonArray ?? new()).OfType<JsonObject>())
            {
                var sp = Load<Spell>(so); sp.Character = ch; _db.Spells.Add(sp);
                if (OldId(so) is int old) spells[old] = sp;
            }
            foreach (var so in (o["companions"] as JsonArray ?? new()).OfType<JsonObject>()) { var x = Load<Companion>(so); x.Character = ch; _db.Companions.Add(x); }
            foreach (var so in (o["statusEffects"] as JsonArray ?? new()).OfType<JsonObject>()) { var x = Load<StatusEffect>(so); x.Character = ch; _db.StatusEffects.Add(x); }
            if (OldId(o) is int oldC) charMap[oldC] = ch;
            pending.Add((ch, skills, spells));
        }
        await _db.SaveChangesAsync();

        // References that need the new ids: skill prerequisites and prepared spells.
        foreach (var (ch, skills, spells) in pending)
        {
            var skillIds = skills.Where(s => s.Old != null).ToDictionary(s => s.Old!.Value, s => s.S.Id);
            foreach (var s in skills)
                s.S.RequiresSkillId = s.Requires is int r && skillIds.TryGetValue(r, out var nr) ? nr : null;
            ch.SpellStateJson = RemapSpellIds(ch.SpellStateJson, spells.ToDictionary(x => x.Key, x => x.Value.Id));
        }

        foreach (var o in Arr("maps").OfType<JsonObject>())
        {
            var m = Load<BattleMap>(o); m.CampaignId = cid; m.CreatedByUserId = importerId; m.IsActive = false;
            m.ImageUrl = await Media(m.ImageUrl) ?? "";
            var tokens = JsonNode.Parse(string.IsNullOrWhiteSpace(m.TokensJson) ? "[]" : m.TokensJson) as JsonArray ?? new JsonArray();
            foreach (var t in tokens.OfType<JsonObject>().ToList())
            {
                var kind = (string?)t["kind"];
                var oldRef = t["refId"] is JsonValue rv && rv.TryGetValue<int>(out var r) ? r : (int?)null;
                if (kind == "monster") t["refId"] = oldRef is int om && monsterMap.TryGetValue(om, out var nm) ? nm.Id : null;
                if (kind == "character")
                {
                    if (oldRef is int oc && charMap.TryGetValue(oc, out var nc)) t["refId"] = nc.Id;
                    else { tokens.Remove(t); continue; }
                }
                if (t["imageUrl"] is JsonValue iv && iv.TryGetValue<string>(out var url)) t["imageUrl"] = await Media(url);
            }
            m.TokensJson = tokens.ToJsonString();
            _db.BattleMaps.Add(m);
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        int Added<T>() where T : class => _db.ChangeTracker.Entries<T>().Count();
        var counts = new Dictionary<string, int>
        {
            ["items"] = Added<ItemTemplate>(), ["feats"] = Added<FeatTemplate>(), ["spells"] = Added<CompendiumSpell>(),
            ["monsters"] = Added<Monster>(), ["maps"] = Added<BattleMap>(), ["mapAssets"] = Added<MapAsset>(),
            ["notes"] = Added<Note>(), ["characters"] = Added<Character>(), ["media"] = uploaded.Count,
        };
        return new ImportResult(cid, name, counts, warnings.Distinct().ToList());
    }

    private static ZipArchive OpenZip(Stream file)
    {
        try { return new ZipArchive(file, ZipArchiveMode.Read); }
        catch (Exception ex) when (ex is InvalidDataException or ArgumentException or IOException)
        { throw new ImportException("The file is not a valid Foliant archive."); }
    }

    private static JsonObject ReadJson(Dictionary<string, ZipArchiveEntry> entries, string name)
    {
        if (!entries.TryGetValue(name, out var e)) throw new ImportException($"{name} is missing in the file.");
        var bytes = ReadBounded(e, MaxJson) ?? throw new ImportException($"{name} is too large.");
        try { return JsonNode.Parse(bytes) as JsonObject ?? throw new ImportException($"{name} is invalid."); }
        catch (JsonException) { throw new ImportException($"{name} is not valid JSON."); }
    }

    /// <summary>Decompresses at most <paramref name="max"/> bytes — the size stored in the zip header
    /// can lie, so a "zip bomb" can't blow up memory. null = larger than allowed.</summary>
    private static byte[]? ReadBounded(ZipArchiveEntry entry, long max)
    {
        if (entry.Length > max) return null;
        using var s = entry.Open();
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = s.Read(chunk, 0, chunk.Length)) > 0)
        {
            if (buffer.Length + read > max) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    /// <summary>Prepared spell slots reference the character's spell rows by id.</summary>
    private static string RemapSpellIds(string json, Dictionary<int, int> map)
    {
        if (JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json) is not JsonObject state) return json;
        void Walk(JsonNode? n)
        {
            switch (n)
            {
                case JsonObject o:
                    foreach (var (k, v) in o.ToList())
                    {
                        if (k.Equals("spellId", StringComparison.OrdinalIgnoreCase) && v is JsonValue val && val.TryGetValue<int>(out var old))
                            o[k] = map.TryGetValue(old, out var nw) ? nw : null;
                        else Walk(v);
                    }
                    break;
                case JsonArray a:
                    foreach (var x in a) Walk(x);
                    break;
            }
        }
        Walk(state);
        return state.ToJsonString();
    }
}
