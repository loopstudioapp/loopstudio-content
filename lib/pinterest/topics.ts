export interface TopicData {
  id: string;
  category: "before_after" | "listicle" | "visual_guide";
  titleTemplate: string;
  descriptionTemplate: string;
  promptSeed: string;
}

// ─── BEFORE & AFTER TOPICS (55) ─────────────────────────────────────────────

export const BEFORE_AFTER_TOPICS: TopicData[] = [
  {
    id: "dark-kitchen-modern-white",
    category: "before_after",
    titleTemplate: "You Won't Believe This Kitchen Transformation",
    descriptionTemplate:
      "See how a dark, outdated 1990s kitchen became a bright modern dream with white cabinets and marble countertops. Pin this for your kitchen reno inspo! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dark outdated 1990s kitchen with brown cabinets and laminate counters | bright modern white kitchen with marble countertops and gold fixtures",
  },
  {
    id: "cramped-bathroom-spa-retreat",
    category: "before_after",
    titleTemplate: "Tiny Bathroom to Spa Retreat — This Glow-Up Is Unreal",
    descriptionTemplate:
      "This cramped bathroom with pink tile got a complete spa-inspired makeover. Floating vanity, rainfall shower, and natural stone everywhere. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "small cramped 1980s bathroom with pink tile and brass fixtures | luxurious spa-inspired bathroom with floating vanity, rainfall shower, and natural stone tile",
  },
  {
    id: "dated-living-room-scandinavian",
    category: "before_after",
    titleTemplate: "From Grandma's Living Room to Scandinavian Paradise",
    descriptionTemplate:
      "This living room went from floral wallpaper and dark wood to a clean Scandinavian dream with light oak floors and neutral tones. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dated living room with floral wallpaper, dark wood paneling, and heavy drapes | bright Scandinavian living room with light oak floors, white walls, and minimalist furniture",
  },
  {
    id: "old-bedroom-boho-retreat",
    category: "before_after",
    titleTemplate: "Bedroom Makeover That Will Make You Want to Redecorate NOW",
    descriptionTemplate:
      "Popcorn ceiling and carpet gone — replaced with a boho retreat featuring rattan accents, linen bedding, and warm earth tones. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "outdated bedroom with popcorn ceiling, beige carpet, and mismatched furniture | cozy boho bedroom retreat with rattan headboard, linen bedding, warm earth tones, and macrame wall art",
  },
  {
    id: "basement-home-office",
    category: "before_after",
    titleTemplate: "Unfinished Basement to Dream Home Office — WOW",
    descriptionTemplate:
      "An unfinished basement with exposed pipes became a sleek home office with built-in shelving and moody lighting. Remote workers, pin this! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "unfinished basement with concrete floors, exposed pipes, and bare bulb lighting | sleek modern home office with built-in shelving, moody dark walls, and warm task lighting",
  },
  {
    id: "builder-grade-entryway-grand",
    category: "before_after",
    titleTemplate: "Builder-Grade Entryway Gets a STUNNING Upgrade",
    descriptionTemplate:
      "Plain builder-grade entryway transformed into a grand welcoming space with statement lighting, board and batten, and a console table. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain builder-grade entryway with beige walls, basic light fixture, and no decor | grand entryway with board and batten walls, statement chandelier, console table, and large round mirror",
  },
  {
    id: "ugly-laundry-room-chic",
    category: "before_after",
    titleTemplate: "This Laundry Room Went From Ugly to Pinterest-Perfect",
    descriptionTemplate:
      "Wire shelves and stained floors are OUT. This laundry room now has custom cabinetry, patterned tile, and a folding station. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "messy laundry room with wire shelving, stained linoleum floor, and exposed plumbing | Pinterest-perfect laundry room with white shaker cabinets, patterned cement tile floor, and butcher block folding counter",
  },
  {
    id: "boring-dining-room-moody",
    category: "before_after",
    titleTemplate: "Boring Dining Room to Moody Dinner Party Haven",
    descriptionTemplate:
      "Beige on beige dining room transformed with dark paint, a statement chandelier, and velvet chairs. Perfect for hosting. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "boring beige dining room with basic oak table, builder-grade chandelier, and no character | moody dining room with dark green walls, brass chandelier, velvet upholstered chairs, and gallery wall",
  },
  {
    id: "nursery-pastel-dream",
    category: "before_after",
    titleTemplate: "Spare Room to Dream Nursery — Every Detail Is Perfect",
    descriptionTemplate:
      "A plain spare room became the most adorable nursery with a cloud mural, custom crib wall, and soft pastel palette. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "empty spare room with beige walls and beige carpet | dreamy pastel nursery with cloud wall mural, white crib, soft pink and sage accents, and whimsical mobile",
  },
  {
    id: "cluttered-closet-boutique",
    category: "before_after",
    titleTemplate: "Messy Closet to Boutique-Style Dressing Room",
    descriptionTemplate:
      "Wire hangers and shoe piles replaced with a custom closet system, velvet hangers, and LED lighting. Closet goals! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "cluttered messy closet with wire hangers, shoe piles on floor, and overstuffed shelves | boutique-style walk-in closet with custom built-ins, velvet hangers, LED strip lighting, and island drawer",
  },
  {
    id: "galley-kitchen-open-concept",
    category: "before_after",
    titleTemplate: "Tiny Galley Kitchen Opens Up Into a Chef's Dream",
    descriptionTemplate:
      "This narrow galley kitchen was completely opened up with a waterfall island, open shelving, and tons of natural light. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "narrow galley kitchen with dark wood cabinets, limited counter space, and no natural light | open-concept kitchen with waterfall quartz island, open shelving, brass hardware, and large window",
  },
  {
    id: "70s-bathroom-modern-black",
    category: "before_after",
    titleTemplate: "1970s Bathroom Gets a Dramatic Black & White Makeover",
    descriptionTemplate:
      "Avocado green is out! This 70s bathroom was reborn with matte black fixtures, white subway tile, and a frameless glass shower. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "1970s bathroom with avocado green tile, shag bath mat, and gold-tone fixtures | dramatic modern bathroom with matte black fixtures, white subway tile, frameless glass shower enclosure",
  },
  {
    id: "flat-backyard-outdoor-living",
    category: "before_after",
    titleTemplate: "Boring Backyard to Outdoor Living Room — Jaw Dropping",
    descriptionTemplate:
      "A flat grass backyard transformed into an outdoor living room with a pergola, fire pit, and string lights. Summer goals! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "flat boring backyard with patchy grass and chain-link fence | stunning outdoor living space with wooden pergola, stone fire pit, sectional sofa, and warm string lights at dusk",
  },
  {
    id: "apartment-studio-functional",
    category: "before_after",
    titleTemplate: "400 sqft Studio Apartment — This Layout Is GENIUS",
    descriptionTemplate:
      "A tiny studio apartment went from chaotic to beautifully zoned with a Murphy bed, floating desk, and smart storage. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "cluttered 400 sqft studio apartment with mattress on floor and no storage | beautifully zoned studio with Murphy bed, floating desk nook, built-in storage, and curtain room divider",
  },
  {
    id: "dated-fireplace-modern-stone",
    category: "before_after",
    titleTemplate: "This Fireplace Makeover Will Stop You in Your Tracks",
    descriptionTemplate:
      "Brick fireplace with brass insert transformed into a stunning floor-to-ceiling stone feature wall with a modern linear fireplace. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dated red brick fireplace with brass insert and oak mantel | stunning floor-to-ceiling stacked stone fireplace with modern linear insert and floating wood mantel",
  },
  {
    id: "dark-den-bright-family-room",
    category: "before_after",
    titleTemplate: "Dark Den to Bright Family Room Everyone Wants to Be In",
    descriptionTemplate:
      "Wood paneling and a drop ceiling were replaced with drywall, recessed lighting, and a cozy sectional. Family room perfection. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dark den with wood paneling, drop ceiling, and old brown carpet | bright airy family room with white walls, recessed lighting, large sectional, and shiplap accent wall",
  },
  {
    id: "master-bath-double-vanity",
    category: "before_after",
    titleTemplate: "Single Sink Master Bath Gets the Double Vanity It Deserves",
    descriptionTemplate:
      "Cramped single vanity bathroom expanded into a luxurious double vanity master bath with freestanding tub and herringbone tile. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "cramped master bathroom with single vanity, builder-grade mirror, and vinyl floor | luxurious master bath with double vanity, freestanding soaking tub, and herringbone marble floor tile",
  },
  {
    id: "carpeted-stairs-hardwood-runner",
    category: "before_after",
    titleTemplate: "Ripping Up Carpet on the Stairs Was the BEST Decision",
    descriptionTemplate:
      "Wall-to-wall stair carpet removed to reveal gorgeous hardwood underneath. Added a modern runner and painted risers for a total glow-up. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "stairs with worn wall-to-wall beige carpet and basic wooden railing | beautiful hardwood stairs with painted white risers, modern striped runner, and black iron balusters",
  },
  {
    id: "plain-patio-mediterranean",
    category: "before_after",
    titleTemplate: "Basic Concrete Patio → Mediterranean Outdoor Oasis",
    descriptionTemplate:
      "A plain concrete slab became a Mediterranean-inspired patio with terracotta pots, a tile bistro table, and climbing vines. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain concrete patio slab with plastic chairs and no decor | Mediterranean outdoor oasis with terracotta pots, patterned tile bistro table, wrought iron chairs, and climbing vines on stone wall",
  },
  {
    id: "teen-room-aesthetic",
    category: "before_after",
    titleTemplate: "Teen Room Makeover — From Boring to TikTok Aesthetic",
    descriptionTemplate:
      "A kid's room grew up into a trendy teen space with LED lights, a gallery wall, and cozy textures. Pin this for your teen! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain children's bedroom with primary color walls and cartoon bedding | aesthetic teen bedroom with LED strip lights, cloud wall gallery, neutral bedding with lots of throw pillows, and floating shelves",
  },
  {
    id: "80s-kitchen-farmhouse",
    category: "before_after",
    titleTemplate: "1980s Kitchen Gets a Modern Farmhouse Glow-Up",
    descriptionTemplate:
      "Oak cabinets and laminate counters replaced with shaker cabinets, butcher block, and an apron-front sink. Farmhouse perfection. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "1980s kitchen with honey oak cabinets, laminate countertops, and fluorescent lighting | modern farmhouse kitchen with white shaker cabinets, butcher block island, apron-front sink, and pendant lights",
  },
  {
    id: "formal-living-cozy-lounge",
    category: "before_after",
    titleTemplate: "Nobody Used This Formal Living Room — Until NOW",
    descriptionTemplate:
      "A stiff formal living room nobody sat in became a cozy lounge with a reading nook, deep sofa, and warm lighting. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "stiff formal living room with matching floral sofa set, china cabinet, and lace curtains | cozy modern lounge with deep sectional sofa, built-in reading nook, warm floor lamps, and layered rugs",
  },
  {
    id: "small-powder-room-jewel-box",
    category: "before_after",
    titleTemplate: "Tiny Powder Room Transformed Into a Jewel Box",
    descriptionTemplate:
      "A plain half-bath became a showstopper with bold wallpaper, a vessel sink, and a statement mirror. Small space, big impact! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain small powder room with pedestal sink, beige walls, and basic mirror | jewel box powder room with bold botanical wallpaper, black vessel sink on wood vanity, and ornate gold mirror",
  },
  {
    id: "garage-gym-conversion",
    category: "before_after",
    titleTemplate: "Garage to Home Gym — This Is Better Than a Membership",
    descriptionTemplate:
      "A cluttered garage became a fully equipped home gym with rubber flooring, mirrors, and motivational wall art. No gym fees ever. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "cluttered two-car garage with boxes, old tools, and concrete floor | clean home gym with rubber flooring, wall-mounted mirrors, weight rack, and motivational vinyl wall decals",
  },
  {
    id: "brown-bedroom-coastal",
    category: "before_after",
    titleTemplate: "Dated Brown Bedroom Gets a Dreamy Coastal Makeover",
    descriptionTemplate:
      "Dark brown furniture and beige walls replaced with a breezy coastal palette — whitewashed wood, ocean blues, and linen everything. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dated bedroom with dark brown furniture set, beige walls, and heavy curtains | dreamy coastal bedroom with whitewashed wood furniture, ocean blue accents, linen bedding, and sheer white curtains",
  },
  {
    id: "yellow-kitchen-navy",
    category: "before_after",
    titleTemplate: "Yellow Kitchen Disaster → Elegant Navy & Brass Stunner",
    descriptionTemplate:
      "Bright yellow walls and floral backsplash gave way to rich navy cabinets with brass hardware and a zellige tile backsplash. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "bright yellow kitchen with floral tile backsplash and white laminate cabinets | elegant kitchen with navy blue cabinets, brass cup-pull hardware, and white zellige tile backsplash",
  },
  {
    id: "sunroom-indoor-garden",
    category: "before_after",
    titleTemplate: "Neglected Sunroom Becomes an Indoor Garden Paradise",
    descriptionTemplate:
      "A dusty sunroom full of junk was cleared out and turned into a plant lover's paradise with hanging planters and a potting bench. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "neglected sunroom with old wicker furniture, dusty blinds, and clutter | lush indoor garden room with hanging planters, potting bench, tropical plants, rattan furniture, and terracotta pots",
  },
  {
    id: "office-nook-under-stairs",
    category: "before_after",
    titleTemplate: "Dead Space Under the Stairs → Cutest Home Office Nook",
    descriptionTemplate:
      "Wasted space under the stairs transformed into a functional home office nook with a built-in desk, shelves, and task lighting. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "empty unused space under staircase with bare walls | charming home office nook under stairs with built-in desk, floating shelves, wallpaper accent, and brass desk lamp",
  },
  {
    id: "popcorn-ceiling-coffered",
    category: "before_after",
    titleTemplate: "Popcorn Ceiling Removed — The Coffered Ceiling Reveal Is STUNNING",
    descriptionTemplate:
      "Popcorn texture scraped off and replaced with elegant coffered ceiling detail. The room looks twice as expensive now. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "room with textured popcorn ceiling and dated flush-mount light | same room with elegant white coffered ceiling, recessed lighting, and crown molding detail",
  },
  {
    id: "apartment-balcony-retreat",
    category: "before_after",
    titleTemplate: "Apartment Balcony Goes From Storage Dump to Cozy Retreat",
    descriptionTemplate:
      "Bikes and boxes cleared off this tiny apartment balcony — now it has bistro seating, plants, and outdoor string lights. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "small apartment balcony cluttered with boxes, bikes, and random storage | cozy balcony retreat with small bistro table, potted plants, outdoor rug, and warm string lights",
  },
  {
    id: "laminate-floor-wide-plank",
    category: "before_after",
    titleTemplate: "Ripping Out Cheap Laminate Was SO Worth It",
    descriptionTemplate:
      "Cheap peeling laminate replaced with wide-plank European oak hardwood. The entire room feels more luxurious instantly. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "room with cheap peeling laminate flooring and visible seams | same room with beautiful wide-plank European oak hardwood flooring with natural grain variation",
  },
  {
    id: "guest-room-hotel-style",
    category: "before_after",
    titleTemplate: "Spare Room to 5-Star Guest Suite — Your Friends Will Never Leave",
    descriptionTemplate:
      "A neglected spare room became a hotel-inspired guest suite with crisp white bedding, bedside sconces, and a luggage bench. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "neglected spare room with old futon, bare walls, and clutter | luxurious hotel-style guest bedroom with upholstered headboard, crisp white bedding, bedside sconces, and luggage bench",
  },
  {
    id: "builder-bathroom-zellige",
    category: "before_after",
    titleTemplate: "Builder-Grade Bathroom Gets the Zellige Tile Treatment",
    descriptionTemplate:
      "Basic builder bathroom with stock everything transformed with handmade zellige tile, matte black fixtures, and a wood vanity. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "basic builder-grade bathroom with stock vanity, chrome fixtures, and plain white tile | artisan bathroom with handmade white zellige tile walls, matte black fixtures, and walnut floating vanity",
  },
  {
    id: "outdated-mantle-modern-shelf",
    category: "before_after",
    titleTemplate: "Fireplace Mantel Makeover That Changed the Whole Room",
    descriptionTemplate:
      "Ornate outdated mantel stripped back to a clean floating shelf design with art and minimal decor. Modern simplicity wins. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "ornate outdated fireplace mantel with heavy carved wood and brass candelabras | clean modern fireplace with floating oak shelf mantel, abstract art, and minimal ceramic vases",
  },
  {
    id: "dark-hallway-bright-gallery",
    category: "before_after",
    titleTemplate: "Dark Hallway Turned Into a Bright Gallery Walkway",
    descriptionTemplate:
      "A dim narrow hallway with no personality became a bright gallery wall hallway with wainscoting and art lighting. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dark narrow hallway with plain beige walls and single overhead light | bright hallway with white wainscoting, curated gallery wall, picture lights, and runner rug",
  },
  {
    id: "playroom-montessori",
    category: "before_after",
    titleTemplate: "Chaotic Playroom to Organized Montessori Dream",
    descriptionTemplate:
      "Toy explosion tamed with low shelving, labeled bins, and a Montessori-inspired layout. Calm play space achieved! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "chaotic playroom with toys scattered everywhere, plastic bins overflowing | organized Montessori-inspired playroom with low wooden shelves, labeled baskets, reading nook, and art station",
  },
  {
    id: "rental-kitchen-removable",
    category: "before_after",
    titleTemplate: "Rental Kitchen Glow-Up Using ONLY Removable Products",
    descriptionTemplate:
      "Peel-and-stick backsplash, removable wallpaper, and contact paper counters made this rental kitchen unrecognizable. All renter-friendly! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain rental kitchen with white laminate cabinets, no backsplash, and basic counters | upgraded rental kitchen with peel-and-stick marble backsplash, contact paper counters, and removable wallpaper accent",
  },
  {
    id: "master-bedroom-hotel-luxury",
    category: "before_after",
    titleTemplate: "Master Bedroom to Hotel Luxury — Every Night Feels Like Vacation",
    descriptionTemplate:
      "A bland master bedroom was elevated with an upholstered wall, layered bedding, and symmetrical nightstands. Pure luxury. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "bland master bedroom with basic bed frame, mismatched nightstands, and bare walls | hotel-luxury master bedroom with full upholstered wall panel, layered white bedding, matching nightstands with lamps",
  },
  {
    id: "linoleum-bathroom-penny-tile",
    category: "before_after",
    titleTemplate: "Linoleum Bathroom Floor Replaced With Penny Tile — Obsessed",
    descriptionTemplate:
      "Peeling linoleum ripped out and replaced with classic black-and-white penny tile. Vintage charm meets modern function. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "bathroom with peeling beige linoleum floor and dated vanity | charming bathroom with black and white penny tile floor, painted vanity, and vintage-style fixtures",
  },
  {
    id: "empty-wall-statement-shelves",
    category: "before_after",
    titleTemplate: "That Big Empty Wall Finally Has a Purpose",
    descriptionTemplate:
      "A large blank wall transformed into a stunning display with asymmetric floating shelves, art, and plants. No more boring walls! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "large empty blank white wall in living room | styled living room wall with asymmetric floating wood shelves, framed art prints, trailing plants, and decorative objects",
  },
  {
    id: "pantry-organization-overhaul",
    category: "before_after",
    titleTemplate: "Messy Pantry to Perfectly Organized — So Satisfying",
    descriptionTemplate:
      "A chaotic pantry with mismatched containers got a complete organization overhaul with clear jars, lazy Susans, and labeled bins. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "messy disorganized pantry with mismatched boxes, bags falling over, and no system | perfectly organized pantry with clear glass jars, labeled bins, lazy Susans, and tiered shelf risers",
  },
  {
    id: "concrete-porch-welcoming",
    category: "before_after",
    titleTemplate: "Sad Concrete Porch to Welcoming Front Entry",
    descriptionTemplate:
      "A bare concrete front porch transformed with a painted floor, potted plants, a welcome mat, and cozy rocking chairs. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "bare concrete front porch with no decor and peeling paint on door | welcoming front porch with painted floor, potted ferns, colorful welcome mat, and white rocking chairs",
  },
  {
    id: "windowless-bathroom-bright",
    category: "before_after",
    titleTemplate: "No Windows? No Problem. This Bathroom Feels SO Bright",
    descriptionTemplate:
      "A dark windowless bathroom was brightened with light tile, a backlit mirror, and strategic layered lighting. No natural light needed. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "dark windowless bathroom with dim single overhead light and dark tile | bright windowless bathroom with large backlit mirror, light porcelain tile, glass shower, and layered LED lighting",
  },
  {
    id: "dated-kitchen-backsplash",
    category: "before_after",
    titleTemplate: "New Backsplash Completely Changed This Kitchen's Vibe",
    descriptionTemplate:
      "Swapping a dated 4-inch granite backsplash for floor-to-ceiling white tile made this kitchen look brand new. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "kitchen with short granite slab backsplash and dark wood cabinets | same kitchen with floor-to-ceiling white stacked tile backsplash that completely transforms the space",
  },
  {
    id: "unfinished-attic-bedroom",
    category: "before_after",
    titleTemplate: "Unfinished Attic → The Coziest Bedroom in the House",
    descriptionTemplate:
      "Raw attic space with exposed rafters became a cozy bedroom under the eaves with skylights and built-in storage. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "unfinished attic with exposed wooden rafters, plywood floor, and bare insulation | cozy attic bedroom with white-painted beams, skylight windows, built-in bed nook, and warm textiles",
  },
  {
    id: "office-cubicle-to-creative",
    category: "before_after",
    titleTemplate: "Home Office Went From Boring Cubicle to Creative Studio",
    descriptionTemplate:
      "A sterile home office with a folding table became an inspiring creative studio with a standing desk, mood board, and warm lighting. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "boring home office with folding table desk, plastic chair, and harsh overhead light | inspiring creative home office with standing desk, cork mood board wall, warm pendant light, and plants",
  },
  {
    id: "brass-everything-matte-black",
    category: "before_after",
    titleTemplate: "Swapping Brass for Matte Black Changed EVERYTHING",
    descriptionTemplate:
      "Every dated brass fixture, handle, and knob was swapped for matte black. The whole house looks like a new build now. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "bathroom with dated shiny brass faucet, towel bar, light fixture, and cabinet pulls | same bathroom with cohesive matte black faucet, towel bar, light fixture, and cabinet pulls",
  },
  {
    id: "formal-dining-casual-banquette",
    category: "before_after",
    titleTemplate: "Formal Dining Room Became a Casual Banquette — We Eat Here Every Night Now",
    descriptionTemplate:
      "Nobody used the formal dining room. A built-in banquette with storage seating made it the family's favorite spot. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "formal dining room with large dark wood table, china cabinet, and chandelier | casual dining nook with built-in banquette seating, round pedestal table, pendant light, and throw pillows",
  },
  {
    id: "small-kitchen-open-shelving",
    category: "before_after",
    titleTemplate: "Upper Cabinets Removed — Open Shelving Made This Kitchen Huge",
    descriptionTemplate:
      "Heavy upper cabinets replaced with floating open shelves opened up this small kitchen dramatically. More light, more space! Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "small kitchen with heavy dark upper cabinets making the space feel closed in | airy kitchen with floating open wood shelves, styled dishes, and plants creating an open spacious feel",
  },
  {
    id: "beige-bedroom-emerald-glam",
    category: "before_after",
    titleTemplate: "Beige Bedroom Goes Bold With Emerald Green — WOW",
    descriptionTemplate:
      "Playing it safe with beige is over. This bedroom went bold with emerald green walls, gold accents, and velvet everything. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain beige bedroom with beige walls, beige bedding, and beige carpet | glamorous bedroom with deep emerald green walls, gold accent furniture, velvet bedding, and dramatic curtains",
  },
  {
    id: "mudroom-drop-zone",
    category: "before_after",
    titleTemplate: "From Shoe Pile to Organized Mudroom Drop Zone",
    descriptionTemplate:
      "Shoes and coats piled by the door? This mudroom makeover added cubbies, hooks, and a bench. Family organization made easy. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "messy entryway with shoes piled up, coats on doorknob, and keys on floor | organized mudroom with built-in cubbies, coat hooks, storage bench with baskets, and boot tray",
  },
  {
    id: "tract-home-exterior-curb-appeal",
    category: "before_after",
    titleTemplate: "Same House, COMPLETELY Different Curb Appeal",
    descriptionTemplate:
      "A boring tract home exterior was transformed with new paint, shutters, landscaping, and a statement front door. Curb appeal 100x. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "boring tract home exterior with beige stucco, no landscaping, and plain door | stunning home exterior with fresh white paint, black shutters, lush landscaping, and bold colored front door",
  },
  {
    id: "studio-apartment-japandi",
    category: "before_after",
    titleTemplate: "Tiny Studio Gets a Calming Japandi Makeover",
    descriptionTemplate:
      "A cluttered studio apartment embraced Japandi design with clean lines, natural materials, and intentional negative space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "cluttered messy studio apartment with too much furniture and no cohesive style | serene Japandi studio with low platform bed, wood and linen furniture, minimal decor, and lots of negative space",
  },
  {
    id: "kids-bathroom-fun",
    category: "before_after",
    titleTemplate: "Kids' Bathroom From Boring to FUN Without Being Childish",
    descriptionTemplate:
      "A plain white kids bathroom got personality with colorful tile, playful hardware, and a fun shower curtain — without going theme-park. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "plain all-white kids bathroom with basic fixtures | fun colorful kids bathroom with multicolored zellige tile, playful round mirror, step stool, and cheerful patterned shower curtain",
  },
];

// ─── LISTICLE TOPICS (52) ────────────────────────────────────────────────────

export const LISTICLE_TOPICS: TopicData[] = [
  {
    id: "small-bathroom-storage-hacks",
    category: "listicle",
    titleTemplate: "10 Small Bathroom Storage Hacks Interior Designers Swear By",
    descriptionTemplate:
      "Maximize every inch of your tiny bathroom with these 10 genius storage hacks. From over-toilet shelving to hidden cabinet organizers. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered tips for maximizing small bathroom storage, each with icon",
  },
  {
    id: "kitchen-mistakes-to-avoid",
    category: "listicle",
    titleTemplate: "7 Kitchen Design Mistakes You're Probably Making Right Now",
    descriptionTemplate:
      "Avoid these common kitchen design mistakes that make your space look cheap. Fix them for a high-end look on any budget. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered kitchen design mistakes with red X icons, showing wrong vs right choices",
  },
  {
    id: "bedroom-cozy-tips",
    category: "listicle",
    titleTemplate: "12 Ways to Make Your Bedroom Feel Like a Luxury Hotel",
    descriptionTemplate:
      "Turn your bedroom into a 5-star retreat with these 12 design tips from professional interior designers. Affordable luxury awaits. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "12 numbered tips for creating a luxury hotel-style bedroom, each with small illustration",
  },
  {
    id: "paint-color-tricks",
    category: "listicle",
    titleTemplate: "8 Paint Color Tricks That Make Any Room Look Bigger",
    descriptionTemplate:
      "The right paint color can transform a small room. These 8 color tricks will make your space look twice as big. Designer secrets revealed. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered paint color tips with paint swatch icons showing colors that make rooms look bigger",
  },
  {
    id: "living-room-layout-rules",
    category: "listicle",
    titleTemplate: "6 Living Room Layout Rules Interior Designers Always Follow",
    descriptionTemplate:
      "Stop pushing furniture against walls! These 6 living room layout rules will make your space look professionally designed. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered living room layout rules with overhead floor plan diagrams for each tip",
  },
  {
    id: "small-space-furniture",
    category: "listicle",
    titleTemplate: "15 Space-Saving Furniture Pieces Every Small Home Needs",
    descriptionTemplate:
      "Living in a small space? These 15 multi-functional furniture pieces will maximize your square footage without sacrificing style. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "15 numbered space-saving furniture items arranged in a grid, each with label and small illustration",
  },
  {
    id: "lighting-layer-tips",
    category: "listicle",
    titleTemplate: "5 Lighting Layers Every Room Needs (Most People Only Have 1)",
    descriptionTemplate:
      "Ambient, task, accent, decorative, and natural — learn the 5 lighting layers that designers use to make rooms feel expensive. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered lighting layer types with room illustration showing where each type goes",
  },
  {
    id: "budget-kitchen-upgrades",
    category: "listicle",
    titleTemplate: "9 Budget Kitchen Upgrades That Look Like a Full Renovation",
    descriptionTemplate:
      "No demo required! These 9 budget-friendly kitchen upgrades will make your kitchen look brand new for a fraction of the cost. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "9 numbered budget kitchen upgrade ideas with before/after mini thumbnails for each",
  },
  {
    id: "home-office-productivity",
    category: "listicle",
    titleTemplate: "11 Home Office Design Tips That Actually Boost Productivity",
    descriptionTemplate:
      "Your workspace design affects your focus. These 11 evidence-based home office tips will help you get more done every day. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "11 numbered productivity-boosting home office design tips with desk setup icons",
  },
  {
    id: "curtain-hanging-rules",
    category: "listicle",
    titleTemplate: "4 Curtain Hanging Rules That Make Windows Look HUGE",
    descriptionTemplate:
      "Hanging curtains wrong is the #1 design mistake. These 4 simple rules will make your windows look taller and your rooms more expensive. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "4 numbered curtain hanging rules with window diagrams showing correct vs incorrect placement",
  },
  {
    id: "nursery-must-haves",
    category: "listicle",
    titleTemplate: "10 Nursery Must-Haves First-Time Parents Always Forget",
    descriptionTemplate:
      "Planning a nursery? Don't forget these 10 essential items that experienced parents say made all the difference. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered nursery must-have items arranged in a checklist format with cute icons",
  },
  {
    id: "rental-apartment-hacks",
    category: "listicle",
    titleTemplate: "13 Renter-Friendly Decor Hacks Your Landlord Will Never Notice",
    descriptionTemplate:
      "Transform your rental without losing your deposit. These 13 removable decor hacks are game-changers for apartment dwellers. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "13 numbered renter-friendly decor hacks with icons showing removable and temporary solutions",
  },
  {
    id: "color-combination-rules",
    category: "listicle",
    titleTemplate: "6 Color Combination Rules Designers Use to Create Stunning Rooms",
    descriptionTemplate:
      "Stop guessing at color palettes. These 6 rules from professional designers will help you pick colors that always work together. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered color combination rules with color wheel diagrams and room examples for each",
  },
  {
    id: "closet-organization-tips",
    category: "listicle",
    titleTemplate: "8 Closet Organization Hacks That Save Hours Every Morning",
    descriptionTemplate:
      "A well-organized closet saves time and reduces stress. These 8 hacks will transform your morning routine forever. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered closet organization hacks with before/after closet section illustrations",
  },
  {
    id: "dining-room-hosting-tips",
    category: "listicle",
    titleTemplate: "7 Dining Room Secrets That Make Hosting Effortless",
    descriptionTemplate:
      "Make every dinner party memorable with these 7 dining room design secrets from professional event planners and designers. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered dining room hosting tips with elegant table setting illustrations",
  },
  {
    id: "bathroom-spa-features",
    category: "listicle",
    titleTemplate: "10 Spa-Worthy Bathroom Features You Can Add This Weekend",
    descriptionTemplate:
      "Turn your bathroom into a spa retreat with these 10 easy additions. Most cost under $50 and take less than an hour to install. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered spa bathroom features with relaxing zen-style icons and product illustrations",
  },
  {
    id: "gallery-wall-rules",
    category: "listicle",
    titleTemplate: "5 Gallery Wall Rules That Make Hanging Art Foolproof",
    descriptionTemplate:
      "Stop putting random holes in your walls. These 5 gallery wall rules will help you create a curated display every time. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered gallery wall layout rules with wall diagrams showing correct frame spacing and arrangement",
  },
  {
    id: "outdoor-space-essentials",
    category: "listicle",
    titleTemplate: "9 Outdoor Living Essentials for a Magazine-Worthy Patio",
    descriptionTemplate:
      "Create the outdoor living space of your dreams with these 9 essential pieces. From furniture to lighting to greenery. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "9 numbered outdoor patio essentials arranged in a visual checklist with lifestyle illustrations",
  },
  {
    id: "laundry-room-hacks",
    category: "listicle",
    titleTemplate: "7 Laundry Room Hacks That Make Chore Day Way Less Painful",
    descriptionTemplate:
      "Make laundry day bearable with these 7 clever organization and design hacks for your laundry room. Small changes, big impact. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered laundry room organization hacks with helpful icons and labeled diagrams",
  },
  {
    id: "entryway-first-impression",
    category: "listicle",
    titleTemplate: "6 Entryway Upgrades That Instantly Elevate Your Home's First Impression",
    descriptionTemplate:
      "Your entryway sets the tone for your entire home. These 6 upgrades will make guests say wow the moment they walk in. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered entryway upgrade ideas with welcoming foyer illustrations for each tip",
  },
  {
    id: "rug-sizing-guide",
    category: "listicle",
    titleTemplate: "The 4 Rug Sizing Rules Nobody Tells You (But Should)",
    descriptionTemplate:
      "The wrong size rug is the most common design mistake. These 4 sizing rules will help you get it right for every room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "4 numbered rug sizing rules with overhead room diagrams showing correct rug placement under furniture",
  },
  {
    id: "accent-wall-ideas",
    category: "listicle",
    titleTemplate: "10 Accent Wall Ideas That Are NOT Just Paint",
    descriptionTemplate:
      "Move beyond painted accent walls with these 10 creative ideas: wood slat, stone, wallpaper, board and batten, and more. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered accent wall ideas in a grid layout showing different textures and materials",
  },
  {
    id: "shelf-styling-formula",
    category: "listicle",
    titleTemplate: "The 5-Step Shelf Styling Formula Designers Don't Share",
    descriptionTemplate:
      "Style shelves like a pro with this 5-step formula. Books, objects, plants, art — learn the perfect ratio for magazine-worthy displays. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered shelf styling steps showing progressive building of a beautifully styled bookshelf",
  },
  {
    id: "apartment-decorating-mistakes",
    category: "listicle",
    titleTemplate: "8 Apartment Decorating Mistakes That Make Your Space Look Tiny",
    descriptionTemplate:
      "Living small doesn't have to feel small. Avoid these 8 common apartment decorating mistakes that are shrinking your space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered apartment decorating mistakes with red X showing wrong approach and green check for right approach",
  },
  {
    id: "plant-styling-tips",
    category: "listicle",
    titleTemplate: "11 Plant Styling Tips That Make Any Room Come Alive",
    descriptionTemplate:
      "Learn how to style indoor plants like an interior designer. From trailing vines to statement trees, these 11 tips cover it all. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "11 numbered indoor plant styling tips with botanical illustrations showing different plant arrangements",
  },
  {
    id: "throw-pillow-formulas",
    category: "listicle",
    titleTemplate: "6 Throw Pillow Combinations That Always Look Perfect",
    descriptionTemplate:
      "Stop guessing at throw pillow combos. These 6 foolproof formulas work on any sofa and in any color scheme. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered throw pillow arrangement formulas shown on sofa illustrations with different patterns and sizes",
  },
  {
    id: "kitchen-counter-declutter",
    category: "listicle",
    titleTemplate: "9 Things to Remove From Your Kitchen Counter RIGHT NOW",
    descriptionTemplate:
      "Cluttered counters make your kitchen look messy. Remove these 9 items for an instantly cleaner, more expensive-looking kitchen. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "9 numbered items to remove from kitchen counters with icons showing each item crossed out",
  },
  {
    id: "wfh-desk-setup",
    category: "listicle",
    titleTemplate: "10 WFH Desk Setup Essentials for a Productive Day",
    descriptionTemplate:
      "Upgrade your work-from-home desk with these 10 essentials that boost productivity, comfort, and style. Your back will thank you. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered work-from-home desk essentials with a labeled desk setup diagram",
  },
  {
    id: "bathroom-tiles-trending",
    category: "listicle",
    titleTemplate: "8 Bathroom Tile Trends That Are Taking Over 2026",
    descriptionTemplate:
      "From zellige to large format to terrazzo, these 8 bathroom tile trends are dominating design boards everywhere this year. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered trending bathroom tile styles in a mood board grid with labeled tile samples",
  },
  {
    id: "small-bedroom-tricks",
    category: "listicle",
    titleTemplate: "10 Small Bedroom Tricks That Make Your Room Feel Twice as Big",
    descriptionTemplate:
      "A small bedroom can still feel spacious. These 10 tricks from designers will help you maximize every square foot. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered small bedroom space-maximizing tricks with room layout diagrams",
  },
  {
    id: "cozy-living-room-essentials",
    category: "listicle",
    titleTemplate: "7 Things Every Cozy Living Room Has in Common",
    descriptionTemplate:
      "The coziest living rooms share these 7 key elements. Layered textures, warm lighting, and more — create your hygge space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered cozy living room essentials with warm inviting illustrations for each element",
  },
  {
    id: "diy-home-upgrades",
    category: "listicle",
    titleTemplate: "12 DIY Home Upgrades You Can Finish in a Single Weekend",
    descriptionTemplate:
      "No contractor needed! These 12 DIY upgrades can be done in a weekend and will make your home look significantly more expensive. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "12 numbered weekend DIY home upgrade projects with tool icons and difficulty ratings",
  },
  {
    id: "statement-light-fixtures",
    category: "listicle",
    titleTemplate: "9 Statement Light Fixtures That Instantly Upgrade Any Room",
    descriptionTemplate:
      "Swap your builder-grade lights for one of these 9 statement fixtures and watch your room transform overnight. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "9 numbered statement light fixture styles with labeled illustrations of each pendant, chandelier, and sconce type",
  },
  {
    id: "kitchen-island-ideas",
    category: "listicle",
    titleTemplate: "8 Kitchen Island Ideas for Every Size Kitchen",
    descriptionTemplate:
      "From compact rolling carts to massive waterfall islands, these 8 kitchen island ideas work for every budget and footprint. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered kitchen island ideas shown in overhead layout diagrams for different kitchen sizes",
  },
  {
    id: "bedroom-nightstand-styling",
    category: "listicle",
    titleTemplate: "5 Nightstand Styling Rules for a Magazine-Worthy Bedroom",
    descriptionTemplate:
      "Your nightstand says a lot about your design taste. These 5 styling rules create the perfect bedside vignette every time. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered nightstand styling rules with side-view illustrations of perfectly styled bedside tables",
  },
  {
    id: "home-value-upgrades",
    category: "listicle",
    titleTemplate: "7 Home Upgrades That Actually Increase Your Property Value",
    descriptionTemplate:
      "Not all renovations boost home value. These 7 upgrades have the highest ROI according to real estate experts. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered home upgrades with ROI percentage icons showing return on investment for each",
  },
  {
    id: "white-paint-shades",
    category: "listicle",
    titleTemplate: "6 White Paint Shades Designers Pick Over and Over Again",
    descriptionTemplate:
      "Not all whites are the same. These 6 go-to white paint colors are what professional designers keep recommending for every room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered white paint shade swatches with room photos showing each shade on walls, with paint names labeled",
  },
  {
    id: "open-concept-zoning",
    category: "listicle",
    titleTemplate: "8 Ways to Define Zones in an Open-Concept Space",
    descriptionTemplate:
      "Open floor plans can feel chaotic without defined zones. These 8 strategies create separation without walls. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered open-concept zoning strategies with overhead floor plan diagrams showing rugs, furniture, and lighting zones",
  },
  {
    id: "walk-in-shower-ideas",
    category: "listicle",
    titleTemplate: "10 Walk-In Shower Ideas That Will Make You Skip the Bathtub",
    descriptionTemplate:
      "Ditch the tub for one of these 10 stunning walk-in shower designs. Rain heads, bench seating, and luxe tile work included. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "10 numbered walk-in shower design ideas in a grid showing different tile patterns, fixtures, and layouts",
  },
  {
    id: "home-smell-tips",
    category: "listicle",
    titleTemplate: "5 Designer Tricks to Make Your Home Smell as Good as It Looks",
    descriptionTemplate:
      "A beautiful home should smell beautiful too. These 5 scent-layering tricks from designers create an inviting atmosphere. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered home fragrance tips with illustrations of candles, diffusers, and fresh flowers in styled rooms",
  },
  {
    id: "kids-room-storage",
    category: "listicle",
    titleTemplate: "9 Kids' Room Storage Solutions That Grow With Your Child",
    descriptionTemplate:
      "Invest in storage that works from toddler to teen. These 9 solutions are stylish, functional, and totally kid-proof. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "9 numbered kids room storage solutions showing modular shelving, bins, and furniture from toddler through teen",
  },
  {
    id: "ceiling-design-ideas",
    category: "listicle",
    titleTemplate: "7 Ceiling Design Ideas That Make Your Room Feel 10x More Expensive",
    descriptionTemplate:
      "Don't forget the fifth wall! These 7 ceiling design ideas — from coffered to painted to wallpapered — add instant luxury. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered ceiling design styles shown from below-looking-up perspective with labels for each style",
  },
  {
    id: "window-treatment-styles",
    category: "listicle",
    titleTemplate: "8 Window Treatment Styles and When to Use Each One",
    descriptionTemplate:
      "Drapes, blinds, shades, shutters — when do you use each? This guide breaks down 8 window treatment styles for every room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered window treatment styles with side-by-side window illustrations showing drapes, roman shades, blinds, shutters etc",
  },
  {
    id: "bathroom-vanity-styles",
    category: "listicle",
    titleTemplate: "6 Bathroom Vanity Styles That Instantly Elevate Your Space",
    descriptionTemplate:
      "Your vanity is the focal point of your bathroom. These 6 vanity styles range from floating modern to vintage farmhouse. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered bathroom vanity styles with labeled illustrations showing floating, vessel sink, double, vintage, and more",
  },
  {
    id: "living-room-coffee-table-styling",
    category: "listicle",
    titleTemplate: "The 4-Object Coffee Table Formula That Always Works",
    descriptionTemplate:
      "A coffee table needs exactly 4 objects to look styled: a tray, books, something organic, and something sculptural. Learn the formula. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "4 numbered coffee table styling objects with overhead view showing tray, books, plant, and decorative object arrangement",
  },
  {
    id: "small-kitchen-maximize",
    category: "listicle",
    titleTemplate: "11 Ways to Maximize Counter Space in a Tiny Kitchen",
    descriptionTemplate:
      "Counter space is precious in a small kitchen. These 11 hacks will give you room to actually cook without feeling cramped. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "11 numbered tips for maximizing kitchen counter space with mini diagrams showing vertical storage, fold-down tables, etc",
  },
  {
    id: "bed-making-layers",
    category: "listicle",
    titleTemplate: "6 Layers to Make Your Bed Look Like a Magazine Cover",
    descriptionTemplate:
      "Professional bed-making is all about layers. These 6 steps will make your bed Pinterest-worthy every single morning. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered bed-making layers shown in cross-section diagram: sheets, duvet, throw, euro shams, sleeping pillows, accent pillows",
  },
  {
    id: "mirror-placement-tricks",
    category: "listicle",
    titleTemplate: "7 Mirror Placement Tricks That Make Rooms Feel Enormous",
    descriptionTemplate:
      "Strategic mirror placement can double the perceived size of a room. These 7 tricks use reflection to maximize light and space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "7 numbered mirror placement strategies with room diagrams showing optimal positions across from windows and in narrow spaces",
  },
  {
    id: "home-color-flow",
    category: "listicle",
    titleTemplate: "5 Rules for Creating Color Flow Between Rooms",
    descriptionTemplate:
      "Make your whole home feel cohesive with these 5 rules for choosing paint colors that flow naturally from room to room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 numbered rules for whole-home color flow with floor plan showing connected rooms and their complementary color palettes",
  },
  {
    id: "patio-furniture-arrangement",
    category: "listicle",
    titleTemplate: "6 Patio Furniture Arrangement Ideas for Any Size Outdoor Space",
    descriptionTemplate:
      "From tiny balconies to large decks, these 6 furniture arrangements make the most of your outdoor living area. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 numbered patio furniture layout diagrams shown from overhead for different sized outdoor spaces",
  },
  {
    id: "texture-mixing-guide",
    category: "listicle",
    titleTemplate: "8 Texture Combinations That Make a Room Feel Rich and Layered",
    descriptionTemplate:
      "Flat rooms lack depth. These 8 texture pairings — velvet with linen, marble with wood — add richness to any space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 numbered texture combination pairings with material swatch circles showing velvet+linen, marble+wood, etc",
  },
];

// ─── VISUAL GUIDE TOPICS (53) ───────────────────────────────────────────────

export const VISUAL_GUIDE_TOPICS: TopicData[] = [
  {
    id: "kitchen-color-schemes",
    category: "visual_guide",
    titleTemplate: "The Complete Guide to Choosing Kitchen Color Schemes",
    descriptionTemplate:
      "Find your perfect kitchen palette with this visual guide comparing 4 trending color schemes. From all-white to bold two-tone. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-by-side comparison of 4 different kitchen color schemes with labeled swatches: all-white, navy and brass, sage and wood, black and marble",
  },
  {
    id: "bedroom-color-psychology",
    category: "visual_guide",
    titleTemplate: "Bedroom Color Psychology — What Each Color Makes You Feel",
    descriptionTemplate:
      "Colors affect your sleep and mood. This visual guide shows how blue, green, lavender, warm gray, and more impact your bedroom vibes. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "color psychology chart for bedrooms with 6 color swatches, each paired with a mood description and mini bedroom illustration in that color",
  },
  {
    id: "flooring-comparison",
    category: "visual_guide",
    titleTemplate: "Hardwood vs Laminate vs LVP vs Tile — The Ultimate Flooring Guide",
    descriptionTemplate:
      "Choosing flooring? This side-by-side comparison covers cost, durability, maintenance, and looks for the 4 most popular options. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison chart of 4 flooring types (hardwood, laminate, LVP, tile) with cost rating, durability rating, and photo sample for each",
  },
  {
    id: "countertop-materials",
    category: "visual_guide",
    titleTemplate: "Kitchen Countertop Materials Compared — Which Is Right for You?",
    descriptionTemplate:
      "Marble, quartz, granite, butcher block, or concrete? This visual comparison breaks down cost, maintenance, and durability. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison guide of 5 kitchen countertop materials with material photo swatch, pros, cons, and price rating for each",
  },
  {
    id: "interior-design-styles",
    category: "visual_guide",
    titleTemplate: "8 Interior Design Styles Explained — Which One Are You?",
    descriptionTemplate:
      "Modern, farmhouse, boho, Japandi, coastal, industrial, traditional, or maximalist? Find your style with this visual guide. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide showing 8 interior design styles in a grid, each with a mini living room illustration and style name: modern, farmhouse, boho, Japandi, coastal, industrial, traditional, maximalist",
  },
  {
    id: "lighting-types-explained",
    category: "visual_guide",
    titleTemplate: "Every Type of Light Fixture Explained in One Visual Guide",
    descriptionTemplate:
      "Pendant, chandelier, sconce, flush mount, semi-flush, recessed, track — learn every fixture type and where to use each one. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide showing 8 light fixture types with labeled diagram for each: pendant, chandelier, sconce, flush mount, semi-flush, recessed, track, table lamp",
  },
  {
    id: "paint-finish-guide",
    category: "visual_guide",
    titleTemplate: "Paint Finishes Explained — Matte vs Eggshell vs Satin vs Semi-Gloss",
    descriptionTemplate:
      "The finish matters as much as the color. This guide explains which paint finish to use in every room and why. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison chart of 5 paint finishes (flat/matte, eggshell, satin, semi-gloss, high-gloss) with sheen level bar, best room usage, and durability rating",
  },
  {
    id: "tile-patterns-guide",
    category: "visual_guide",
    titleTemplate: "12 Tile Layout Patterns — From Subway Stack to Herringbone",
    descriptionTemplate:
      "The same tile can look completely different based on the layout pattern. See 12 popular tile patterns and where to use them. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "grid of 12 tile layout patterns with labeled diagrams: stack bond, running bond, herringbone, chevron, basketweave, pinwheel, hexagon, brick, diagonal, versailles, fish scale, arabesque",
  },
  {
    id: "sofa-styles-guide",
    category: "visual_guide",
    titleTemplate: "10 Sofa Styles Explained — Find Your Perfect Match",
    descriptionTemplate:
      "Chesterfield, mid-century, sectional, or camelback? This visual guide helps you identify and choose the right sofa style. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide of 10 sofa styles with side-profile silhouettes and labels: Chesterfield, mid-century, sectional, lawson, camelback, English roll arm, Bridgewater, tuxedo, cabriole, modular",
  },
  {
    id: "cabinet-hardware-guide",
    category: "visual_guide",
    titleTemplate: "Cabinet Hardware Styles — Knobs vs Pulls vs Cup Pulls Explained",
    descriptionTemplate:
      "The right cabinet hardware can transform your kitchen. This guide shows every style and the design aesthetic each one creates. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 8 cabinet hardware styles with illustrations: round knob, bar pull, cup pull, ring pull, T-knob, edge pull, latch, and bin pull with style labels",
  },
  {
    id: "bathroom-layout-guide",
    category: "visual_guide",
    titleTemplate: "Bathroom Layouts for Every Size — From Tiny to Spacious",
    descriptionTemplate:
      "Planning a bathroom renovation? These overhead layout diagrams show the best configurations for every bathroom size. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "overhead floor plan layouts for 5 different bathroom sizes: powder room, small full bath, standard bath, master bath, and luxury master bath with fixture placement",
  },
  {
    id: "wood-tone-mixing",
    category: "visual_guide",
    titleTemplate: "How to Mix Wood Tones Without Clashing — A Visual Guide",
    descriptionTemplate:
      "Mixing wood tones is tricky but not impossible. This visual guide shows which wood tones pair beautifully and which ones clash. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide showing wood tone combinations with sample swatches: pairs that work (green check) vs pairs that clash (red X) for oak, walnut, cherry, maple, pine, mahogany",
  },
  {
    id: "chair-styles-guide",
    category: "visual_guide",
    titleTemplate: "15 Classic Chair Styles Every Design Lover Should Know",
    descriptionTemplate:
      "From Eames to wingback, learn to identify 15 iconic chair styles. Impress your friends and make smarter furniture picks. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide showing 15 iconic chair silhouettes in a grid with labels: Eames lounge, wingback, Barcelona, Wishbone, Adirondack, papasan, slipper, club, accent, rocking, egg, ghost, butterfly, ladder-back, bergère",
  },
  {
    id: "kitchen-layout-types",
    category: "visual_guide",
    titleTemplate: "6 Kitchen Layouts Explained — Which One Fits Your Space?",
    descriptionTemplate:
      "Galley, L-shape, U-shape, island, peninsula, or one-wall? This visual guide shows the pros and cons of each kitchen layout. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 kitchen layout types shown as overhead floor plans with work triangle marked: galley, L-shape, U-shape, island, peninsula, one-wall",
  },
  {
    id: "window-types-guide",
    category: "visual_guide",
    titleTemplate: "Every Window Type Explained — A Homeowner's Visual Guide",
    descriptionTemplate:
      "Casement, double-hung, bay, picture — know your windows. This guide helps you choose the right style for every room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide showing 10 window types with exterior view diagrams: double-hung, casement, bay, bow, picture, awning, slider, skylight, clerestory, arched",
  },
  {
    id: "fabric-types-home",
    category: "visual_guide",
    titleTemplate: "Home Fabric Guide — Linen vs Cotton vs Velvet vs Performance",
    descriptionTemplate:
      "Choosing upholstery and curtain fabric? This guide compares linen, cotton, velvet, leather, and performance fabric for every use. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "fabric comparison chart with texture swatches for 6 home fabrics: linen, cotton, velvet, leather, performance, silk with durability and use-case ratings",
  },
  {
    id: "backsplash-styles",
    category: "visual_guide",
    titleTemplate: "Kitchen Backsplash Styles — Subway, Zellige, Marble Slab & More",
    descriptionTemplate:
      "Your backsplash sets the tone for your kitchen. Compare 8 popular styles from classic subway to trendy zellige in this guide. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison of 8 kitchen backsplash styles with labeled photos: classic subway, zellige, marble slab, penny round, hexagon, glass mosaic, patterned cement, stacked linear",
  },
  {
    id: "color-temperature-guide",
    category: "visual_guide",
    titleTemplate: "Warm vs Cool Colors — How to Choose the Right Temperature for Each Room",
    descriptionTemplate:
      "Color temperature can make or break a room. Learn which rooms need warm tones and which need cool tones with this guide. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "split comparison showing warm-toned rooms vs cool-toned rooms with color temperature spectrum and recommended rooms for each",
  },
  {
    id: "molding-trim-styles",
    category: "visual_guide",
    titleTemplate: "Crown Molding & Trim Styles — A Visual Comparison",
    descriptionTemplate:
      "Crown molding, baseboards, chair rail, wainscoting — this guide shows every trim style profile and how it changes a room. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 8 molding and trim profiles shown in cross-section: crown molding, baseboard, chair rail, wainscoting, picture rail, casing, panel molding, shiplap",
  },
  {
    id: "bed-frame-styles",
    category: "visual_guide",
    titleTemplate: "Bed Frame Styles Compared — Platform vs Upholstered vs Canopy & More",
    descriptionTemplate:
      "Choose the perfect bed frame with this side-by-side visual comparison of 8 popular styles, from minimalist to statement. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual guide of 8 bed frame styles with front-view illustrations: platform, upholstered, canopy, four-poster, sleigh, panel, storage, and floating",
  },
  {
    id: "outdoor-material-guide",
    category: "visual_guide",
    titleTemplate: "Outdoor Furniture Materials — Teak vs Aluminum vs Wicker Compared",
    descriptionTemplate:
      "Choosing patio furniture? Compare teak, aluminum, wicker, steel, and recycled plastic for durability, cost, and style. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison chart of 5 outdoor furniture materials with weather resistance, cost, maintenance, and style ratings: teak, aluminum, wicker/rattan, wrought iron, recycled HDPE",
  },
  {
    id: "sink-styles-kitchen",
    category: "visual_guide",
    titleTemplate: "Kitchen Sink Styles — Farmhouse vs Undermount vs Drop-In Compared",
    descriptionTemplate:
      "Your kitchen sink choice affects both function and style. Compare 6 popular sink styles with this visual guide. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 6 kitchen sink styles shown in cross-section and overhead: farmhouse/apron, undermount, drop-in, integrated, bar/prep, workstation",
  },
  {
    id: "wall-treatment-ideas",
    category: "visual_guide",
    titleTemplate: "10 Wall Treatment Ideas Beyond Paint",
    descriptionTemplate:
      "Wallpaper, board and batten, stone veneer, wood slat — explore 10 wall treatments that add texture and personality beyond simple paint. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "grid of 10 wall treatment styles with labeled room photos: wallpaper, board and batten, shiplap, wood slat, stone veneer, brick, grasscloth, wainscoting, limewash, venetian plaster",
  },
  {
    id: "door-styles-interior",
    category: "visual_guide",
    titleTemplate: "Interior Door Styles Explained — Panel, Shaker, French & More",
    descriptionTemplate:
      "Interior doors set the architectural tone. This guide compares 8 door styles from classic panel to modern flush. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 8 interior door styles with front-view illustrations: 6-panel, shaker, French, barn, flush, glass, Dutch, and arched",
  },
  {
    id: "shower-tile-patterns",
    category: "visual_guide",
    titleTemplate: "Shower Tile Patterns — Visual Guide to 8 Stunning Layouts",
    descriptionTemplate:
      "Transform your shower with the right tile pattern. This visual guide shows 8 layouts from classic to contemporary. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "8 shower tile pattern layouts shown in shower-wall illustrations: vertical stack, horizontal brick, herringbone, chevron, large format, mosaic niche, accent stripe, floor-to-ceiling slab",
  },
  {
    id: "dining-table-shapes",
    category: "visual_guide",
    titleTemplate: "Dining Table Shapes — Round vs Rectangle vs Oval Compared",
    descriptionTemplate:
      "The shape of your dining table affects traffic flow and conversation. Compare round, rectangle, oval, and square for your space. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "overhead comparison of 4 dining table shapes in rooms: round, rectangular, oval, and square with seating capacity and room size recommendations",
  },
  {
    id: "neutral-paint-undertones",
    category: "visual_guide",
    titleTemplate: "How to Read Neutral Paint Undertones — The Guide That Changes Everything",
    descriptionTemplate:
      "That gray looks blue? That white looks pink? Learn to spot undertones in neutral paints so you never pick the wrong shade. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "neutral paint undertone guide showing gray, beige, and white swatches with arrows pointing to hidden undertones: blue, green, pink, yellow, purple",
  },
  {
    id: "living-room-layouts",
    category: "visual_guide",
    titleTemplate: "Living Room Layouts for Every Shape — Square, Rectangle, L-Shaped",
    descriptionTemplate:
      "Match your furniture layout to your room shape. This overhead guide shows optimal arrangements for 5 common living room shapes. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 living room layout diagrams from overhead showing furniture placement for square, rectangle, L-shaped, narrow, and open-concept rooms",
  },
  {
    id: "faucet-finish-guide",
    category: "visual_guide",
    titleTemplate: "Faucet Finishes Compared — Chrome, Brass, Black, Nickel & More",
    descriptionTemplate:
      "Your faucet finish ties the whole room together. Compare 6 popular finishes with this visual durability and style guide. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison of 6 faucet finishes with close-up photos: polished chrome, brushed nickel, matte black, brushed gold/brass, oil-rubbed bronze, polished brass",
  },
  {
    id: "ceiling-height-tricks",
    category: "visual_guide",
    titleTemplate: "Visual Tricks to Make Low Ceilings Look Higher",
    descriptionTemplate:
      "Low ceilings don't have to feel cramped. This visual guide shows 6 design tricks that create the illusion of height. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "6 side-by-side room comparisons showing low ceiling vs same room with height-enhancing tricks: vertical stripes, tall curtains, low furniture, vertical art, painting ceiling lighter, tall bookcases",
  },
  {
    id: "kitchen-hardware-pairing",
    category: "visual_guide",
    titleTemplate: "How to Pair Kitchen Cabinet Colors With Hardware Finishes",
    descriptionTemplate:
      "White cabinets + brass? Navy + gold? This visual matching guide shows which hardware finishes look best with popular cabinet colors. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "pairing guide showing 6 cabinet colors (white, navy, sage, black, wood, gray) each matched with their best hardware finish options in a grid format",
  },
  {
    id: "area-rug-shapes",
    category: "visual_guide",
    titleTemplate: "Area Rug Shapes — When to Use Round, Rectangle, or Runner",
    descriptionTemplate:
      "The right rug shape can define or destroy a room. This visual guide shows when to use each shape for maximum impact. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "overhead room diagrams showing optimal rug shapes for different furniture layouts: rectangle under dining table, round under round table, runner in hallway, square in reading nook",
  },
  {
    id: "bathroom-fixture-finishes",
    category: "visual_guide",
    titleTemplate: "Matching Bathroom Fixtures — A Finish Coordination Guide",
    descriptionTemplate:
      "Faucet, showerhead, towel bar, mirror frame — should they all match? This visual guide shows 5 cohesive fixture finish schemes. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "5 bathroom fixture finish schemes shown side by side: all matte black, all brushed nickel, mixed metals (gold+black), all polished chrome, warm brass throughout",
  },
  {
    id: "staircase-railing-styles",
    category: "visual_guide",
    titleTemplate: "Staircase Railing Styles — Traditional to Modern Compared",
    descriptionTemplate:
      "From classic wood balusters to sleek cable railing, compare 6 staircase railing styles and the aesthetic each creates. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-by-side comparison of 6 staircase railing styles: traditional wood balusters, iron balusters, cable railing, glass panel, horizontal metal, half-wall",
  },
  {
    id: "kitchen-open-vs-closed",
    category: "visual_guide",
    titleTemplate: "Open Shelving vs Upper Cabinets — The Pros and Cons Visualized",
    descriptionTemplate:
      "Can't decide between open shelving and upper cabinets? This visual comparison shows the benefits and drawbacks of each approach. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "split comparison of same kitchen with open shelving on left and upper cabinets on right, with labeled pros and cons for each",
  },
  {
    id: "pendant-light-height",
    category: "visual_guide",
    titleTemplate: "Pendant Light Height Guide — How High to Hang Over Every Surface",
    descriptionTemplate:
      "Hanging pendants at the wrong height is a common mistake. This guide shows exact measurements for islands, tables, and hallways. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-view diagrams showing correct pendant light hanging heights with measurements: over kitchen island (30-36in), over dining table (30-34in), in hallway (7ft min), over bathroom vanity",
  },
  {
    id: "color-palette-seasonal",
    category: "visual_guide",
    titleTemplate: "Seasonal Home Color Palettes — Spring, Summer, Fall, Winter",
    descriptionTemplate:
      "Refresh your home with the seasons using these curated color palettes. 4 seasonal schemes with paint, fabric, and accent colors. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "4 seasonal color palettes with 5 coordinating swatches each: spring pastels, summer coastal blues, fall warm earth tones, winter deep jewel tones, with room mood photos",
  },
  {
    id: "wallpaper-pattern-guide",
    category: "visual_guide",
    titleTemplate: "Wallpaper Patterns Decoded — Floral, Geometric, Textured & More",
    descriptionTemplate:
      "Navigate the world of wallpaper with this guide to 8 major pattern types and the rooms where each one works best. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "grid of 8 wallpaper pattern categories with sample swatches and labeled room suggestions: floral, geometric, botanical, toile, stripe, grasscloth, damask, abstract",
  },
  {
    id: "stone-types-comparison",
    category: "visual_guide",
    titleTemplate: "Natural Stone Compared — Marble vs Granite vs Quartzite vs Soapstone",
    descriptionTemplate:
      "Natural stone adds luxury but each type has different care needs. Compare 4 popular stones for cost, durability, and maintenance. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "comparison of 4 natural stone types with polished slab photos, hardness rating, stain resistance, cost, and best use cases: marble, granite, quartzite, soapstone",
  },
  {
    id: "room-proportion-guide",
    category: "visual_guide",
    titleTemplate: "Furniture Scale Guide — How to Size Pieces for Your Room",
    descriptionTemplate:
      "Oversized furniture in a small room or tiny pieces in a large space both look wrong. This guide shows proper proportions. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-by-side room comparisons showing wrong scale (too big/too small furniture) vs right scale for living room, bedroom, and dining room",
  },
  {
    id: "island-vs-peninsula",
    category: "visual_guide",
    titleTemplate: "Kitchen Island vs Peninsula — Which Is Right for Your Layout?",
    descriptionTemplate:
      "Not every kitchen needs an island. Compare islands and peninsulas side by side to see which fits your space and how you cook. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "split overhead layout comparison of kitchen with island vs kitchen with peninsula, showing traffic flow arrows, seating options, and minimum clearance measurements",
  },
  {
    id: "greenery-placement-guide",
    category: "visual_guide",
    titleTemplate: "Where to Place Plants in Every Room — A Visual Guide",
    descriptionTemplate:
      "Not sure where to put your plants? This room-by-room visual guide shows the best spots for floor plants, shelf plants, and hanging plants. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "room illustrations showing optimal plant placement with arrows: tall floor plant in corner, trailing plant on shelf, hanging plant by window, small plant on nightstand, herbs in kitchen",
  },
  {
    id: "accent-color-ratios",
    category: "visual_guide",
    titleTemplate: "The 60-30-10 Color Rule — A Visual Breakdown",
    descriptionTemplate:
      "The 60-30-10 rule is the secret to balanced rooms. This visual guide shows how to apply it with real room examples and color breakdowns. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual breakdown of the 60-30-10 color rule applied to 3 different rooms with pie charts showing dominant (60%), secondary (30%), and accent (10%) color distribution",
  },
  {
    id: "mirror-shapes-guide",
    category: "visual_guide",
    titleTemplate: "Mirror Shapes — Round vs Arched vs Rectangular and Where to Use Each",
    descriptionTemplate:
      "The shape of your mirror changes the whole room's vibe. This guide shows which mirror shapes work best in bathrooms, entryways, and more. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 6 mirror shapes (round, arched, rectangular, oval, sunburst, irregular) shown in context above vanities and in entryways",
  },
  {
    id: "bathtub-styles",
    category: "visual_guide",
    titleTemplate: "Bathtub Styles Compared — Freestanding, Alcove, Corner & More",
    descriptionTemplate:
      "From clawfoot to Japanese soaking tubs, compare 6 bathtub styles and find the perfect one for your bathroom renovation. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-by-side comparison of 6 bathtub styles with side-profile illustrations: freestanding, alcove, corner, drop-in, Japanese soaking, clawfoot",
  },
  {
    id: "home-style-era-guide",
    category: "visual_guide",
    titleTemplate: "Home Architecture Styles by Era — 1920s to 2020s",
    descriptionTemplate:
      "Identify your home's architectural style with this decade-by-decade visual guide. From Craftsman to Mid-Century Modern to contemporary. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "timeline visual showing home architectural styles by decade from 1920s to 2020s with house exterior illustrations: Craftsman, Colonial Revival, Art Deco, Ranch, Mid-Century, Split-Level, Postmodern, Contemporary",
  },
  {
    id: "drawer-organizer-guide",
    category: "visual_guide",
    titleTemplate: "The Ultimate Drawer Organization Guide — Kitchen, Bathroom, Bedroom",
    descriptionTemplate:
      "Transform every drawer in your home with this visual organization guide showing optimal divider layouts for 6 drawer types. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "overhead view of 6 perfectly organized drawer layouts: kitchen utensil, junk drawer, bathroom vanity, bedroom dresser, desk drawer, and spice drawer with labeled sections",
  },
  {
    id: "curtain-length-guide",
    category: "visual_guide",
    titleTemplate: "Curtain Length Guide — Float, Kiss, Puddle, and Break Explained",
    descriptionTemplate:
      "The length of your curtains changes everything. This visual guide shows the 4 curtain lengths and which look works best where. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "side-by-side illustration of 4 curtain length styles on identical windows: float (1/2 inch above floor), kiss (touching floor), break (1-2 inches on floor), puddle (6+ inches pooling)",
  },
  {
    id: "art-hanging-height",
    category: "visual_guide",
    titleTemplate: "Art Hanging Height Guide — Center It at THIS Line Every Time",
    descriptionTemplate:
      "Stop hanging art too high! This visual guide shows the correct center point for art above sofas, mantels, beds, and in hallways. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "room illustrations showing correct art hanging heights with measurement lines: 57 inches center from floor, 6-8 inches above sofa back, 4-6 inches above mantel, eye level in hallway",
  },
  {
    id: "bathroom-storage-zones",
    category: "visual_guide",
    titleTemplate: "Bathroom Storage Zones — Where Everything Should Live",
    descriptionTemplate:
      "Organize your bathroom by zones with this visual layout guide. Shower zone, vanity zone, toilet zone, and linen zone explained. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "labeled bathroom floor plan and elevation showing 4 storage zones with specific items in each: shower caddy zone, vanity zone, toilet area zone, and linen closet zone",
  },
  {
    id: "roof-style-guide",
    category: "visual_guide",
    titleTemplate: "Roof Styles Explained — Gable, Hip, Mansard, Flat & More",
    descriptionTemplate:
      "Know your roof style with this visual guide. From gable to gambrel to butterfly, see 8 roof types and what they say about your home. Download Roomy AI to visualize your own transformation.",
    promptSeed:
      "visual comparison of 8 roof styles with labeled line drawings: gable, hip, mansard, flat, gambrel, shed, butterfly, and Dutch gable",
  },
];

// ─── COMBINED EXPORT ─────────────────────────────────────────────────────────

export const ALL_TOPICS: TopicData[] = [
  ...BEFORE_AFTER_TOPICS,
  ...LISTICLE_TOPICS,
  ...VISUAL_GUIDE_TOPICS,
];
