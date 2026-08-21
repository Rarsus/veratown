# BC Bondage Furniture Map Objects & Location Commands

This document maps all BC bondage furniture items that have map objects to their usage in Veratown location commands.

## ✅ Dot Notation Support

The location update command now supports **dot notation** for nested fields! You can update furniture configuration directly:

```
!location update my_furniture data.furnitureAsset "Bed"
!location update my_furniture data.durationMs 120000
!location update my_furniture data.restraints '[...]'
```

All examples in this document use this dot notation format and are now fully supported.

## Quick Start Example

Create and configure a bondage bed in 5 commands:

```
!location add my_bed "Bondage Bed" furniture 50 20
!location update my_bed data.furnitureAsset "Bed"
!location update my_bed data.durationMs 120000
!location update my_bed data.restraints '[{"group":"ItemArms","asset":"LeatherCuffs","difficulty":20}]'
!location enable my_bed
```

The character will now be equipped with a Bed and LeatherCuffs for 2 minutes when standing on that tile!

## Furniture with Map Objects (13 Types)\n\nThese furniture items have dedicated map object representations in BC:

| Asset Name | Map ID | Map Style | Height | Notes | Location Command |
|---|---|---|---|---|---|
| **Bed** | 120, 166 | BedTeal, Bed | 0.82-1.8 | Standard bed, multiple styles | `furniture 50 20` |
| **Kennel** | 1010 | Kennel | 2 | Pet containment | `furniture 50 20` |
| **X-Cross** | 1020 | X-Cross | 2 | Restraint cross | `furniture 50 20` |
| **BondageBench** | 1030 | BondageBench | 2 | Bondage furniture | `furniture 50 20` |
| **Trolley** | 1040 | Trolley | 2 | Mobile constraint | `furniture 50 20` |
| **Locker** | 1050 | Locker | 2 | Enclosure | `furniture 50 20` |
| **WoodenBox** | 1060 | WoodenBox | 2 | Wooden containment | `furniture 50 20` |
| **Coffin** | 1070 | Coffin | 1.85 | Full enclosure | `furniture 50 20` |
| **TheDisplayFrame** | 1080 | TheDisplayFrame | 2 | Display equipment | `furniture 50 20` |
| **Pole** | 1090 | Pole | 1.8 | Pole dancing/bondage | `furniture 50 20` |
| **MedicalBed** | 1095 | MedicalBed | 1.8 | Medical/bondage bed | `furniture 50 20` |
| **FuturisticCrate** | 1096 | FuturisticCrate | 2 | High-tech containment | `furniture 50 20` |
| **Throne** | 102 | ThroneRed | 2 | Decorative restraint | `furniture 50 20` |

## Furniture Without Map Objects

These are in ItemDevices but don't have dedicated map objects (character equipment only):

- WoodenBoxOpenHead
- SmallWoodenBox, SmallWoodenBoxOpenHead
- SmallLocker
- PetBed, PetBowl
- Cage, LowCage, PersonalCage, LeatherCage
- X-Frame
- Sybian, FuckMachine, WoodenHorse, OneBarPrison, OneBarGirl
- VacBed, VacBedDeluxe, VacBedClear, VacCube
- DisplayCase, SmallDisplayCase
- WoodenStocks
- Crib, Highchair
- InflatableBodyBag, InflatableRestraintBag
- BrickWall, KabeshiriWall, GlueFloor
- TheHangingFrame
- BurlapSack
- SaddleStand
- TransportWoodenBox
- ChangingTable, CryoCapsule
- Coffin (has a map object variant)
- And others not listed above

**Note**: Furniture without map objects still work with the furniture system—they just won't appear as visible objects on the map. Characters will have the item equipped when entering, but it's invisible to the room.

## Creating Furniture Locations

### All furniture uses the same command format:

```
!location add <key> "<name>" furniture <x> <y>
!location update <key> data.fieldName value         # Supports dot notation for nested fields
```

**Dot Notation Support**: You can update nested fields like `data.furnitureAsset` directly without needing to specify the entire data object.

### Examples for Each Furniture Type

#### 1. **Bed**
```
!location add bed_pink "Pink Bondage Bed" furniture 50 20
!location update bed_pink data.furnitureAsset "Bed"
!location update bed_pink data.durationMs 120000
!location enable bed_pink
```

#### 2. **Kennel**
```
!location add kennel_master "Master's Kennel" furniture 45 25
!location update kennel_master data.furnitureAsset "Kennel"
!location update kennel_master data.furnitureProperties '{"d":0,"p":1}'
!location update kennel_master data.restraints '[{"group":"ItemNeck","asset":"LeatherCollar","color":"#FF69B4"}]'
!location enable kennel_master
```

#### 3. **X-Cross**
```
!location add xcross_red "Red X-Cross" furniture 40 30
!location update xcross_red data.furnitureAsset "X-Cross"
!location update xcross_red data.restraints '[
  {"group":"ItemArms","asset":"LeatherCuffs","difficulty":20},
  {"group":"ItemLegs","asset":"LeatherCuffs","difficulty":20}
]'
!location enable xcross_red
```

#### 4. **BondageBench**
```
!location add bench_training "Training Bench" furniture 55 35
!location update bench_training data.furnitureAsset "BondageBench"
!location update bench_training data.restraints '[
  {"group":"ItemArms","asset":"HempRope","difficulty":18},
  {"group":"ItemLegs","asset":"HempRope","difficulty":18}
]'
!location enable bench_training
```

#### 5. **Trolley**
```
!location add trolley_mobile "Mobile Restraint Trolley" furniture 60 40
!location update trolley_mobile data.furnitureAsset "Trolley"
!location update trolley_mobile data.durationMs 300000
!location enable trolley_mobile
```

#### 6. **Locker**
```
!location add locker_storage "Bondage Locker" furniture 65 45
!location update locker_storage data.furnitureAsset "Locker"
!location update locker_storage data.durationMs 600000
!location enable locker_storage
```

#### 7. **WoodenBox**
```
!location add box_heavy "Heavy Wooden Box" furniture 35 28
!location update box_heavy data.furnitureAsset "WoodenBox"
!location update box_heavy data.restraints '[
  {"group":"ItemArms","asset":"HempRope"},
  {"group":"ItemLegs","asset":"HempRope"}
]'
!location update box_heavy data.durationMs 180000
!location enable box_heavy
```

#### 8. **Coffin**
```
!location add coffin_prison "Confinement Coffin" furniture 70 50
!location update coffin_prison data.furnitureAsset "Coffin"
!location update coffin_prison data.durationMs 900000
!location enable coffin_prison
```

#### 9. **TheDisplayFrame**
```
!location add display_showcase "Display Frame" furniture 25 22
!location update display_showcase data.furnitureAsset "TheDisplayFrame"
!location update display_showcase data.restraints '[
  {"group":"ItemArms","asset":"IronCuffs","difficulty":25},
  {"group":"ItemNeck","asset":"IronChain"}
]'
!location enable display_showcase
```

#### 10. **Pole**
```
!location add pole_dance "Bondage Pole" furniture 48 32
!location update pole_dance data.furnitureAsset "Pole"
!location update pole_dance data.durationMs 150000
!location enable pole_dance
```

#### 11. **MedicalBed**
```
!location add bed_medical "Medical Restraint Bed" furniture 52 38
!location update bed_medical data.furnitureAsset "MedicalBed"
!location update bed_medical data.restraints '[
  {"group":"ItemArms","asset":"MetalCuffs","difficulty":22},
  {"group":"ItemLegs","asset":"MetalCuffs","difficulty":22}
]'
!location enable bed_medical
```

#### 12. **FuturisticCrate**
```
!location add crate_future "Futuristic Containment Crate" furniture 58 42
!location update crate_future data.furnitureAsset "FuturisticCrate"
!location update crate_future data.durationMs 300000
!location enable crate_future
```

#### 13. **Throne**
```
!location add throne_master "Master's Throne" furniture 30 25
!location update throne_master data.furnitureAsset "Throne"
!location update throne_master data.furnitureColor "#8B4513"
!location update throne_master data.durationMs 0
!location enable throne_master
```

## Advanced: Configuration Options

Each furniture location can have these optional configurations:

```json
{
  "furnitureAsset": "Bed",                    // Required
  "furnitureGroup": "ItemDevices",            // Default: ItemDevices
  "furnitureExtendedType": "Soft",            // Optional variant
  "furnitureColor": "#000000",                // Hex color
  "furnitureProperties": {"d":0, "p":1},      // TypeRecord (furniture-specific)
  "craftDescription": "Custom description",   // Display name
  "restraints": [                             // Array of restraint objects
    {
      "group": "ItemArms",                   // Required: Asset group
      "asset": "LeatherCuffs",               // Required: Asset name
      "extendedType": "Cuffs",               // Optional: Type variant
      "difficulty": 20,                       // Optional: Lock difficulty (0-50)
      "color": "#000000"                      // Optional: Hex color
    }
  ],
  "applyDelayMs": 0,                          // Optional: Delay before restraints apply
  "durationMs": 120000                        // Optional: Auto-removal timer in ms
}
```

## Map Object Properties Explained

Each furniture has these visual properties when placed on the map:

| Property | Example | Meaning |
|---|---|---|
| `Top` | -1 | Vertical positioning (negative = lower) |
| `Height` | 2 | Object height on screen |
| `Left` | 0.05 | Horizontal offset |
| `Width` | 0.90 | Object width |

These are automatically handled by BC when the map object is present.

## Choosing the Right Furniture

### For Containment
- **Kennel** - Pet-themed, compact
- **WoodenBox** - Multipurpose, sturdy
- **Coffin** - Full enclosure, dramatic
- **Locker** - Storage-themed

### For Display/Mounting
- **X-Cross** - Spread position restraint
- **BondageBench** - Lower body focus
- **TheDisplayFrame** - Presentation/display
- **Throne** - Seated position

### For Mobility
- **Trolley** - Mobile restraint
- **Pole** - Standing/climbing position

### For Comfort/Rest
- **Bed** - Sleep/rest themed
- **MedicalBed** - Clinical/medical theme

### For High-Tech
- **FuturisticCrate** - Sci-fi aesthetic

## Best Practices

1. **Map Placement**: Place furniture at coordinates where there's open floor space (no walls/obstacles)

2. **Duration Guidelines**:
   - Quick punishment: 60,000-180,000 ms (1-3 minutes)
   - Medium restraint: 300,000-600,000 ms (5-10 minutes)
   - Long confinement: 900,000+ ms (15+ minutes)
   - Permanent: Omit `durationMs` or set to 0

3. **Restraint Combinations**:
   - Bed: Arms + Legs common
   - Cross/Bench: Full arm/leg cuffs
   - Kennel: Optional collar
   - Box/Coffin: Keep restraints minimal (furniture already contains)

4. **Colors**: Use hex codes that match furniture theme (e.g., black for metal, brown for wood)

5. **Extended Types**: Check ItemDevices.md for asset-specific variants (e.g., Bed has no extended types, but some furniture does)

## Troubleshooting

**Furniture not visible on map:**
- Verify coordinates are on walkable floor (not walls/water)
- Check that `furnitureAsset` matches exactly (case-sensitive)
- Confirm location is enabled: `!location enable <key>`

**Restraints not applying:**
- Verify group/asset names are correct (case-sensitive)
- Check that character appearance has available item slots
- Ensure difficulty is 0-50 range

**Duration not working:**
- Confirm `durationMs` is in milliseconds (e.g., 60000 = 1 min)
- Verify character is in room when timer expires
- Check console for timeout errors

## Related Documentation

- [Furniture Bondage System Docs](VERATOWN_FURNITURE_BONDAGE.md)
- [ItemDevices Reference](items/ItemDevices.md)
- [Bondage System Overview](BONDAGE.md)
- [Location Management](LOCATION_MANAGEMENT.md)

## Map IDs Quick Reference

| ID | Asset | Style | Height |
|---|---|---|---|
| 120 | Bed | BedTeal | 0.25 |
| 102 | Throne | ThroneRed | 2 |
| 166 | Bed | Bed | 1.8 |
| 442 | Kennel | Kennel | 2 |
| 447 | WoodenBox | WoodenBox | 2 |
| 450 | Pole | Pole | 1.8 |
| 451 | MedicalBed | MedicalBed | 1.8 |
| 452 | FuturisticCrate | FuturisticCrate | 2 |
| 1010 | Kennel | Kennel | 2 |
| 1020 | X-Cross | X-Cross | 2 |
| 1030 | BondageBench | BondageBench | 2 |
| 1040 | Trolley | Trolley | 2 |
| 1050 | Locker | Locker | 2 |
| 1060 | WoodenBox | WoodenBox | 2 |
| 1070 | Coffin | Coffin | 1.85 |
| 1080 | TheDisplayFrame | TheDisplayFrame | 2 |
| 1090 | Pole | Pole | 1.8 |
| 1095 | MedicalBed | MedicalBed | 1.8 |
| 1096 | FuturisticCrate | FuturisticCrate | 2 |
