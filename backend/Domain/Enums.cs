namespace Foliant.Api.Domain;

public enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

public enum ItemCategory { Weapon, Armor, Consumable, Magic, Quest, Material }

/// <summary>PF1e armor category (drives proficiency, speed and the monk/barbarian armor rules).</summary>
public enum ArmorType { None, Light, Medium, Heavy, Shield, TowerShield }

public enum EquipSlot
{
    Head, Neck, Shoulders, Chest, Hands, Belt, Legs, Feet,
    Ring1, Ring2, Cloak, MainHand, OffHand,
    // Generic item slot: a "Ring" item fits either physical ring slot (Ring1/Ring2).
    // Appended last so existing stored int values stay put. Never a physical slot.
    Ring,
    // Same pattern for earrings: physical Earring1/Earring2, generic "Earring" item slot.
    Earring1, Earring2, Earring
}
