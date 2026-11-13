// Cursed Coin blank. Print flat, recess up, no supports.
// The 38 mm sticker sits in the recess; an NFC sticker can go underneath it.
coin_d = 44;
thickness = 3.6;
recess_d = 38.4;
recess_depth = 0.8;
$fn = 160;

difference() {
  cylinder(d = coin_d, h = thickness);
  translate([0, 0, thickness - recess_depth]) cylinder(d = recess_d, h = recess_depth + 1);
}
