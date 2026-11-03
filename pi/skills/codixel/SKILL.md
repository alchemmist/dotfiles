---
name: codixel
description: Changes how pixel art is made with AI. Instead of drawing from imagination, ask the user for a reference image, pixelate it, rig it, animate it, and check every step with the user. Use whenever the user asks for pixel art of any kind (sprites, characters, creatures, effects, scenes, props, tiles, gems).
license: MIT
---

# Codixel

You are not a painter. You write code. When you draw something complex from imagination (a dragon, an angel, a character, an animal), the result looks bad. When you start from a real image and turn it into pixels, the result looks good. This skill makes you work the second way and keeps the user in control of every step.

## Showing an image

The terminal cannot show pictures. Every time this skill says "show", do this:

1. Save the result as a PNG with `P.save` (and a GIF with `P.gif` when it moves) in the user's project, or in a folder the user named.
2. Open the PNG yourself with the Read tool and look at it.
3. Give the user the full path of each file.

Read shows only the first frame of a GIF, so check motion on a numbered frame sheet, not on the GIF.

Keep one preview image per piece of work. Put everything you want to show (frames, the last frame next to the first, the reference) on one sheet with `P.sheet`, not in separate files, and save each new version over the same file. The same goes for the GIF.

## Use the core, do not start from scratch

This skill comes with `core/pixel.js`, next to this file. Use it instead of writing image code or effects yourself. In Node: `const P = require("<skill folder>/core/pixel.js")`. In a browser, load it with a script tag and use the global `P`; draw a buffer on a canvas with `P.blit(buf, ctx, x, y)`. Loading and saving files only works in Node; in a browser `P.gif` returns a `Uint8Array`.

**Buffers.** `new P.Buf(w, h)` holds the pixels. `ox`, `oy` set the world offset: every drawing method takes world coordinates, so with `b.ox = -120; b.oy = -120` the point (0, 0) is 120 pixels in from the left and top. Methods: `pset`, `get`, `rect`, `line`, `poly`, `blob` (soft dithered circle), `ring`, `sprite`, `field(fn, palette)` (one value per pixel turned into a palette color with dither), `dither`, `scaled(n)`, `clear`.

**Images.** These work on whole buffers and return a new one:

- `P.load(file)` reads a PNG, `P.save(buf, file)` writes one. Other formats, and interlaced PNGs, must be converted to a plain PNG first with any tool you have (ImageMagick, ffmpeg, Python PIL).
- `P.removeBg(buf, { tol, color, seeds, flood, erode })` removes a plain background. It finds the background color from the image edges and fills inward from them. `tol` (default 48) is how far a color may be from the background and still count as background. `flood: false` also removes background color inside the subject (holes between legs). Soft edges leave a light or dark ring around the subject; `erode: 1` or `2` cuts that many pixels off the outer edge (also `P.erode(buf, n)`).
- `P.trim(buf, pad)`, `P.crop(buf, x, y, w, h)`, `P.bounds(buf)`.
- `P.resize(buf, w, h, { mode })` averages the pixels. Leave out `h` to keep the shape (`P.resize(buf, w, { mode: true })` works too). Pixels end up fully solid or fully clear. Averaging blurs small details like eyes into a gray spot; `mode: true` keeps the most common color in each cell instead, use it on an image you already quantized at full size.
- `P.quantize(buf, n, { palette, dither })` cuts the colors down to `n`, or maps them to a palette you give. Returns `{ buf, palette }`. `dither: true` mixes the two nearest colors in a thin strip where they meet, so soft shading keeps its steps instead of turning into flat bands.
- `P.cleanup(buf, { tol, keepLone })` removes single stray pixels. It keeps a lone pixel when its color is very different from its neighbors (an eye, a highlight). A pixel with no solid neighbor at all is removed unless `keepLone: true` (a spark floating free). After dithering, use `tol: 20` or lower, or the dither pixels count as strays and get removed.
- `P.smoothEdge(buf, { fill })` cleans the silhouette: it removes one pixel bumps, one pixel wide strips and two pixel nubs, and fills one pixel holes and dents. `P.smoothMask(mask, w, h)` does the same on a 0/1 mask. When a subject is made of overlapping parts (leaves, petals, plates), clean each part's mask on its own and put them together after, so the cleanup does not cut gaps where two parts overlap.
- `P.edgeCheck(buf)` returns `{ nubs, strips, holes }`, the positions of pixels that stick out, one pixel wide strips and holes inside the silhouette.
- `P.outline(buf, color, { corners })` adds a one pixel outline. The new buffer is 2 pixels wider and taller and everything moves 1 pixel right and down, so joint positions read before the outline are off by one after it.
- `P.selout(buf, lit, shade, { dir })` adds a one pixel outline in two colors: `lit` on the side the light comes from, `shade` on the other sides. `dir` is where the light comes from, `[-1, -1]` (top left) by default. Take both colors from the sprite's own ramp (a middle color for `lit`, the darkest for `shade`), not black. It grows the buffer like `P.outline`.
- `P.rimLight(buf, ramp, { dir, steps })` makes the edge pixels that face the light one ramp step lighter. Use it with `P.selout` to make the shape crisp, and call it first: `P.selout(P.rimLight(buf, ramp), lit, shade)`. Called after `P.selout`, the edge pixels are the outline, so the rim lands on the outline and the sprite gets none.

**Bones.** For parts that turn at a joint (legs, arms, wings, head):

```js
const rig = new P.Rig(sprite)
  .bone("body", null, 32, 60, 8, 52)
  .bone("head", "body", 34, 22, 32, 4)
  .bind({ joint: 2, paint: { head: [[20, 0], [50, 0], [50, 26], [20, 26]] } });
const pose = { body: { a: 0, dy: -1 }, head: 0.2 };
rig.draw(buf, x, y, pose, { flip: false });
rig.drawBones(big, x * 4, y * 4, pose, { scale: 4 });

const grid = P.ruler(sprite, 6, { step: 8 });
rig.drawBones(grid, 0, 0, pose, { scale: 6 });
```

`bone(name, parent, x, y, endX, endY, z)` takes the joint and the tip in sprite pixels. Parents come before children. `bind` gives every pixel to its nearest bone; `paint` gives the pixels inside a polygon to a bone instead, use it when the nearest bone is wrong. `joint` is how wide the overlap along the seams is, so no gaps open when parts turn. A pose gives each bone an angle in radians, or `{ a, dx, dy }`.

Do not guess where the joints are. `P.ruler(sprite, scale, { step })` scales the sprite up with numbered grid lines every `step` sprite pixels, so you can read the joint and tip coordinates off the image. Its world offset is set so `rig.drawBones(grid, 0, 0, pose, { scale })` lands on the sprite.

Check which pixels belong to which bone before animating. `rig.ownerMap()` returns the sprite tinted with each bone's color (joint overlap is tinted lighter), and `rig.legend()` lists the bone names next to their colors:

```js
const own = P.ruler(rig.ownerMap(), 6, { step: 8 });
rig.drawBones(own, 0, 0, {}, { scale: 6 });
P.save(P.sheet([own, rig.legend()]), "owners.png");
```

A wrong area (a shoulder tinted like the head) shows up here, not after the animation. Fix it with `paint` in `bind` and show it again.

**Long bodies.** For things that curve along a spine (snake, dragon, tail, tentacle): `P.bend(buf, sprite, rest, pose)`. `rest` is the spine as points in sprite pixels, `pose` is the same number of points where the spine should be now. `P.wave(points, t, amp, length, { from })` gives a moving wave along a spine; the wave is still at the start (`from`) and strongest at the end.

**Showing work.**

- `P.sheet(items, { cols, scale, fit, gap })` puts several buffers in one image with labels above them. An item is a buffer or `{ buf, label, scale }`. `fit: 192` scales each one to about 192 pixels high. Clear pixels show as a checker.
- `P.text(buf, x, y, "A", color, scale)` writes letters, numbers and `- . : / + ( ) #`.
- `P.gif(frames, { delay, scale, loop })` returns an animated GIF. `delay` is in milliseconds, one number or a list.
- `P.pack(frames, { cols, pad })` puts frames of the same size in a grid on a clear background, with no labels and no checker. This is the sprite sheet for the game; `P.sheet` is only for showing. The result has `frame` with `w`, `h`, `cols`, `rows`, `count`.

**Color and motion.** `P.palette(cols, n)`, `P.ramp`, `P.mix`, `P.ditherIndex`, `P.noise`, `P.fbm`, `P.rng(seed)`, `P.ease`.

- `P.hueRamp(n, { hue, shift, sat, satDrop, light })` builds a ramp of `n` colors that shifts in hue: the dark end turns toward blue, the light end toward yellow, by up to `shift` degrees (default 60), and saturation is highest in the middle. `hue` is the middle color in degrees (green about 110, red 0, blue 220). `P.hsl(h, s, l)` gives one color.
- `P.band(v, n, x, y, strip)` turns a value from 0 to 1 into one of `n` ramp steps. Each step is a flat band, and only a thin strip where two bands meet is mixed with dither, the same width on both sides of the line. Use it instead of `P.ditherIndex` for shading by hand.
- `P.hueRampFrom(colors, n, opt)` builds the same kind of ramp from colors measured on a photo: it takes their main hue, saturation and lightness range. `P.toHsl(color)` returns `[hue, saturation, lightness]`.
- `P.colorCount(buf)` lists every color with how many pixels use it and its share.
- `P.pixelPerfect(mask, w, h)` removes the corner pixel of every L step in a 0/1 mask of 1 pixel lines, so diagonals go corner to corner. Blocks and junctions are kept.
- `P.partAreas(masks)` gives the visible pixel count of each part, with later masks drawn on top. `P.balanceParts(make, count, { want, iters })` calls `make(scales)` for a list of masks and changes each scale until the visible areas match `want` (all equal by default); it returns `{ scales, masks, areas }`. Use it for parts that repeat (leaflets, petals, legs), because a part drawn first loses pixels to the ones on top and a part turned to another angle covers more pixels, so equal sizes in code do not look equal.

**Scenes and props.** Use these for anything drawn in code that should look real: rock, earth, trees, water, sky, gems, animal bodies.

- `P.sky(buf, { cols, y0, y1 })` is a sky from top to horizon in flat bands. `P.clouds(buf, { base, h, cols, seed, amount, haze, hazeCol })` adds clouds that are lit on the sun side and flat and darker at the bottom.
- `P.rockHeight({ sx, sy, seed, crack, tilt })` returns a height function for rock: blocks with cracks between them. `P.surface(buf, { height, cols, moss, shade, mask, x0, y0, x1, y1, relief, gain, light })` lights any height function, darkens cracks and puts `moss` colors on faces that point up. Use it for cliffs, stones, earth and wood. `shade(x, y)` multiplies the light, for wet or shadowed parts.
- `P.branchTree(buf, { x, base, trunk, width, depth, spread, decay, up, clumpR, tipClumps, hang, hangTo, cols, bark, seed, haze, hazeCol, wind })` grows a trunk into branches with leaf clumps at the tips. Oak: `spread: 0.55, up: 0.15`. Poplar: `spread: 0.2, up: 0.5, depth: 5`. Willow: `spread: 0.85` with `hang` for the hanging strands. `P.conifer(buf, { x, base, h, rx, cols, bark })` is a pine. `P.tree` is a quick round tree for far away. All leaves go through `P.foliage`: small leaf cells, shadow inside the crown, holes at the edge. `haze` mixes in `hazeCol` for distance.
- `P.grass(buf, { x0, x1, count, ground, hmin, hmax, cols, density, tall, t, T, freq, sway, period, shift })` draws blades of grass. `ground(x)` gives the y of the ground.
- `P.reflect(buf, { y0, y1, t, T, cols, keep, falloff, squash, wob })` turns the rows from `y0` down into water that mirrors what is above it, with ripples. `cols` is the water color from near the line to deep. `P.mist(buf, { x, y, w, h, below, t, T, col, strength })` is see-through spray.
- `P.solid(buf, prims, cols, { light, shade, dark, k })` draws a lit body from shapes melted together: `P.cap(ax, ay, bx, by, ra, rb)` (a tube that can get thinner) and `P.ell(x, y, rx, ry, rot)`. Use it for animal and human bodies, sacks, cloaks. `P.ik(hipX, hipY, footX, footY, upper, lower, dir)` returns the knee of a two-part leg; `dir` 1 or -1 picks which way it bends.
- `new P.Gem({ size, cols, sigma, ior, tilt, lean })` draws a cut gem by following the light through it: it bends at the surface, bounces inside and gets darker the longer it travels. `sigma` is how fast red, green and blue are absorbed (ruby: `[0.32, 5.5, 4.2]`), `cols` the palette. `gem.frames(n)` gives n frames of one full turn, centered.
- Loops: `P.loopNoise(x, y, t, T, speed)` is noise that moves and is back at the start when `t` reaches `T`. `P.WBuf` is a buffer that wraps from its right edge to its left edge, `P.tile(fn, period)` makes a height or noise function repeat with no seam, and `P.wrapBlit(dst, layer, shift)` draws a wrapped layer moved by `shift`. `P.blitScaled(dst, w, h, layer, shift, S)` draws a layer S times bigger into a plain pixel array at a shift that need not be a whole pixel: the pixels stay big, but the layer moves smoothly.
- `P.leafFlicker(still, moved, frames, { density, maxY })` takes a tree layer drawn with no wind and one drawn with `wind`, and returns frames where only a few leaf pixels at the edges of the crowns move.

**Effects.** These are taken from finished games. Change colors, sizes and timing to fit the request, but keep the method.

- `P.novaSmoke(buf, x, te, t, { front, fade, cols, scale })`: big smoke explosion with gathering, light column, shock rings, rising dome and smoke clouds. Call it with `front: false` before drawing the subject and `front: true` after. Ground is at y = 0, up is negative. `te` is the time since the eruption. At `scale: 1` it is about 480 pixels wide and 200 high; use `scale` to fit the scene.
- `new P.Breath({ length, cols })`: fire breath from a mouth. Call `step(on, steps)` every frame and `draw(buf, hx, hy, aA, aB, t, open, floor)` to draw it from the mouth at (`hx`, `hy`) between the angles `aA` and `aB`. Angles are in radians, 0 points right and positive turns down. `open` 0 to 1 sets how wide the cone opens. Nothing is drawn below the y of `floor` (by default the buffer's bottom); set it to the ground so the fire does not go through it. With `step(true, 3)` it reaches full length after about 50 frames.
- `new P.HellFire(w, h, { cols })`: wall of fire rising from the bottom. Call `step(power, cool, steps)` every frame (`power` 0 to 1 feeds the bottom row, `cool` 1 to 3 makes it shorter) and `draw(buf, x, ground)`, where `x` is the left edge and `ground` the y of the bottom (by default the buffer's left and bottom).
- `P.volley(t0, n, { w, h, safe, width })` and `P.beams(buf, list, t, cols)`: thin blinking warning lines, then bright beams with bloom and a screen flash.
- `new P.Flame(opt)` and `new P.Smoke(opt)`: a realistic flame and a realistic smoke column, made with the method in section 4. Call `draw(buf, x, ground, t)` every frame, with `x` the center and `ground` the y of the bottom. Options: `height`, `width`, `speed` (how fast the noise rises), `rough` (how broken the edges are), `sway` and `swayAmp` (how much the top swings), `bits` (chance of a spark each frame, 0 for none), `fx` and `fy` (noise size, smaller makes bigger shapes), `cols`. A calm candle is about `{ height: 40, width: 11, speed: 2.2, rough: 1, swayAmp: 5, bits: 0.15 }`. Smoke is see-through and needs room: about 84 pixels high by default. To have it rise from a flame, set its `ground` a few pixels below the flame's tip and draw it first, so the flame is in front.
- `P.Flow` is the base of both. For another effect (steam, a magic aura, a waterfall), extend it and give it `profile(h)`, the half width at height `h` (0 at the ground, 1 at `height`, 0 for nothing), and `value(dx, h)`, how strong the effect is at that spot without noise (`dx` is -1 to 1 across the width). `warp` bends the noise sideways more the higher it goes, so the effect curls. `calm` is how much noise there is at the base (0 keeps it as a thin, steady stream). `alpha`, a list of opacities from faint to strong, makes it see-through: each band is mixed with what is already in the buffer, and on a clear buffer the pixel keeps that opacity. A GIF cannot be see-through, so fill the background before making one.

For timing, pass a slower or faster time to the effect (for example `te * 0.5`).

The default colors (green smoke, gold breath, red fire) are only there so the effects run. Always pass `cols` that fit the request. If the request does not say a color, ask.

## 1. Before drawing anything, ask

When the user asks for pixel art, decide what it is:

- **Simple object** (crate, rock, house, tree, icon): you can draw it in code directly. Go to section 3 (Style).
- **Complex subject** (dragon, character, creature, wings, face, vehicle, anything organic or detailed): do not start drawing. Ask first.

Ask in the user's language, with words like these:

> "If I draw a dragon from scratch it won't look good. It works much better if you send me a picture of the dragon you want and I turn it into pixel art. Do you have a reference image, or should I still draw it from scratch?"

Wait for the answer.

- If they send an image, go to section 2.
- If they still want it from scratch, draw it, but keep it small and simple and show it right away.

If you do not know the size or where it will be used, ask that too:

> "What size should it be, and where will it go (game scene, icon, background)?"

**Earlier versions.** Before you start, look in the folder where previews go for an earlier version of the same subject. If there is one, or the user approved one before, ask whether to match it, and when working on your own, match it and put it on every sheet. A word for the subject may hide a choice (a clover can have three leaflets or four); when there is no earlier version, ask, or when working on your own, pick the common reading and say which you picked.

**Who brings references.** A subject that will be turned into pixels (a character, a creature, a vehicle) comes from the user: do not search the web for one unless the user asks. If there is no reference, ask for one. If the user has none, draw it in code.

Anything drawn in code (a simple object like a leaf or a crate, a material like water or rock, an effect, a scene) needs no photos, even when the user asks for it to look real. Do not search for or download photos yourself: a photo you pick shows what you found, which may not be what the user has in mind. Draw it from what you know of the real thing and build its colors with `P.hueRamp`. A reference is what the user gives you to show what they want. When the user gives a photo of a material or scene, use it to compare and to measure colors from (see "Realistic materials"), never to turn into pixels.

**Where the reference comes from.** If the user's own photo or drawing, or an image with a license that allows it (public domain, CC0, CC BY), there is nothing to ask. If it looks like someone else's artwork and the result will be published or sold, say so once:

> "This looks like someone else's art. If the game will be published, you need their permission, or we can use it only for the pose and colors, or find a free image like it."

Then do what the user decides.

**If the user wants it fast.** When they say to skip the questions, do all the steps in one go and show one sheet with every step on it, then ask what to change. Game files still wait for approval (see "Preview first" below).

**Preview first.** The first thing you hand over is only a preview: a GIF and the frame sheet you checked. Do not make the sprite sheet, the per-frame files, a script for the user or any other game file yet. Make them only after the user says they like the preview. This holds for everything in this skill, effects included, and also when the user says to work on your own or to skip the questions.

## 2. Work from the reference, one step at a time

Do one step, show the result as an image, and ask before going on. Show one result, next to the reference in one image made with `P.sheet`. Show a few versions side by side only when the user asks for options.

1. **Remove the background** so only the subject is left. Skip this if the image already has a clear background. `P.removeBg` works when the background is one plain color; if a ring of the old background stays around the edge, add `erode: 1` or `2`. If the edges are busy (a photo, a scene), ask the user for a version with a clear background, or use a background removal tool if one is installed (for example rembg). Then `P.trim`. Show it.
2. **Turn it into pixels** at the size the user wants: `P.resize`, then `P.quantize` with `dither: true`, then `P.cleanup` with `tol: 20`, then `P.smoothEdge`. If small details like eyes turn into gray spots, quantize at full size first and then `P.resize` with `mode: true`. Pick the width and color count that fit the request and show that one. Add an outline with `P.outline` only if the user asks for one, and add it to the finished frames, after the bones.
3. **If it moves, give it bones.** Use `P.Rig` for parts that turn at a joint and `P.bend` for long bodies. Read the joint positions off `P.ruler` and show the bones on top of it with `rig.drawBones` at the same scale. Then show `rig.ownerMap()` with `rig.legend()` and fix wrong areas before animating.
   Turning a small pixel sprite gives jagged edges and broken lines, more so at big angles. If the sprite is small (under about 64 pixels) or the parts must turn far, give the bones to the clean full-size image instead and turn each frame into pixels afterwards, the way it is done for several images below. When unsure, pick one and say which way you used.
4. **Animate it with the bones.** Move with `P.ease` curves so motion speeds up and slows down instead of moving at one speed. Show the frames as a numbered sheet. You cannot see a GIF move, so look at the sheet yourself, and give the user a GIF from `P.gif` so they can see the motion.
5. **Put it in the scene.** Show it next to everything else.
6. **Save it for the game.** Draw every frame into a buffer of the same size, put them together with `P.pack`, and save the PNG. Tell the user the frame size, the number of frames, the columns and the delay. If the game wants one file per frame, save each frame with `P.save` instead.

**When the subject is put together from several images** (wings from one picture, a body from another), put the parts together and give them bones at full size first, then turn each frame into pixels. Quantize the first frame at full size, then pass its palette to `P.quantize` for every other frame so the colors stay the same, and shrink each frame with `P.resize` and `mode: true`.

After each step, ask something like:

> "Here it is. Is it right, or should I change something?"

Go to the next step only when the user says it is right.

## 3. Style

When the user says how it should look, for example "realistic", do exactly that. Do not pick colors, palettes, effects or extra details the user did not ask for.

For any soft change between colors (a sky, shading on a round shape, smoke, fire), keep each color as a flat band and mix only a thin strip where two bands meet, with `P.band` or `P.field`. Do not dither the whole area, and do not use a smooth gradient with many colors. This holds for every piece, not only effects: if a finished sprite has no dither at its band edges, the value range is too narrow (see below).

**Hue shifting.** Build every ramp with `P.hueRamp`, or by hand the same way: darker steps move toward cool (blue, cyan, purple), lighter steps toward warm (yellow, orange), and saturation drops a little at both ends. A ramp that only changes lightness looks flat and dead. The light end of a mid-tone object (a leaf, grass, an apple) stays well away from white: if the lightest steps look pale or washed out next to the reference, lower `light` and keep `sat` up. The shift only shows when the sprite uses most of the ramp: the value across the object should run over most of it, from the darkest step in the deepest part to the lightest at the brightest part. Check it with `P.colorCount`: if one color covers more than half the object, or the two ends of the ramp are almost unused, widen the range. Both hue shifting and dither come from this range.

**Flat things and round things.** Before shading, decide whether the object is flat and thin or has volume.

- Flat and thin (a leaf, a petal, paper, cloth, a flag, a sign, a wing membrane): do not light it from a surface normal like a dome, it turns puffy and plastic. Its tones come from its own color pattern (a leaf goes from dark at the base to light at the tip), its markings, its veins or folds, the shadow where one part lies on another, and the outline.
- Flat as a whole is not smooth. A leaf has relief: the blade rises between the veins and drops into them, and drops toward the base. Build a height field from the distance to the nearest vein (low on the vein, high in the middle of each panel, lower toward the base) and light every pixel from its slope with the one light of the scene, so one side of each groove is lit and the other is in shade. This is not dome lighting: the part as a whole stays flat, only the small relief is lit. Check two things in numbers: the sign (with light from the top left, a slope that rises toward the right and down faces the light and must come out lighter), and the spread (print the 5th and 95th percentile of the slope; scale it so it covers about -1 to 1, because at about ±0.3 the relief barely shows).
- Round things with volume (stone, fruit, a body, a head, a gem, a barrel): light them from one direction.
- A flat surface still needs some life: a few structural lines (veins, seams, folds), a small tone difference between the two sides of a fold, and, only on parts bigger than about 16 pixels, a soft wide color variation from `P.fbm`, never per-pixel grain. On smaller parts noise bends every band edge into scattered patches and the inside looks dirty. Keep it light. When the texture is as strong as the main color change, it is too much; it should never hide it.
- Details like a midrib, a marking or a stripe move the color by a fixed ramp step (one step lighter), not by adding to the value before dither. Added to the value, they break into scattered specks.

**Shapes.** Build round shapes from round parts joined together: a heart is two circles and a wedge. Cutting one shape out of another (a notch cut with a circle) leaves sharp corners where the cut meets the edge. Natural things that repeat (leaves, petals, fingers) differ a little in angle and size; at even spacing and equal size the silhouette reads as a square or a cross. Parts that repeat must read as separate at 1x, with a gap or a dark crease between them, and parts that join (a stem and a leaf, a joint, a handle) must touch. Thin parts (a stem, a rope, a hair) keep the same width along their length; a step from 2 to 3 pixels at a bend reads as a bump. Color a thin part by its side of the curve, not by its column, or the light and dark pixels swap at every step and it looks broken.

**Order.** Every tone patch inside a part must come from something you can name: the band from base to tip, the two sides of a fold or midrib (one ramp step apart), a vein, the shadow of a part on top, a small highlight on the lit side. Lay the tones out as a few big areas that follow that structure, with dither only in a narrow strip where two bands meet. A patch with no reason is noise, even when it is soft. Order is not flatness: when you take noise out, keep the shading that has a reason, or the part turns into a flat sticker and stops looking real. On a leaf, each panel between two veins is lighter in its middle and darker toward the veins and the base. A reference can be noisy too; take its shape and palette, not its noise.

**Lines.** Draw 1 pixel lines (veins, seams, cracks, hair) pixel-perfect: a diagonal step goes from corner to corner, with no extra pixel in the corner of the step (an L). Draw them into a mask with `b.line` or by stepping along the segment, then clean the mask with `P.pixelPerfect`. Give a line one fixed color, a ramp step darker than the area around it; a line that takes "one step darker than the band below" changes color where it crosses a band edge and reads as dashes.

**Parts around a center.** Leaflets, petals and similar parts that sit around a center touch only near it; further out the silhouette shows a notch or a gap between each pair. When neighbors overlap along most of their length, the whole thing reads as one disc or a sliced pie, and a crease line cannot save it. Work this out before rendering: for a part made of round lobes, take each lobe's distance from the center and its angle off the part's axis, and check that the lobes of two neighbors are at least two radii apart. Shrink the lobes or narrow the base until they are. Then give every part the same visible size with `P.balanceParts`, unless the request says one is bigger.

**Inner structure.** Before drawing, write down the structure of the real thing that still shows at this size, and draw each item. A leaf has a midrib and side veins branching off it toward the edge, and a narrow base; a petal has fine lines from its base; a feather has a shaft and vanes; a shell has growth ridges; a wing has its bones. A shape filled with only a gradient and soft noise reads as a blob, not as the thing. Draw veins and ridges as lines exactly one ramp step darker than what is around them (not two), thinner and fewer than on the real thing, and stop them well before the edge. They are a hint, not a drawing of every vein: a part about 12 pixels long gets a midrib and two short pairs of side veins. How heavy they look comes from their pixel share and their contrast together: at one step of contrast and no halo, about 20 to 25% of a part's pixels read well; at two steps, or with the area around them darkened too, the same lines look like stripes or a fishbone, and with only a midrib and one short pair the leaf looks bare. Do not darken the area around a line as well; a dark halo makes it look twice as thick.

Veins grow like a tree. The main vein is the trunk: it starts at the very base, where the part is attached, and runs almost to the tip, and it must be seen along its whole length, base included. Side veins start on the trunk and branch forward toward the edge. Give the trunk its own fixed color and the side veins a lighter weight, so the order reads at a glance. A trunk disappears wherever the tone under it is the same as its own, which happens first at the base, where parts are usually darkest: check the tones along the trunk, and lift the base by a step or pick a trunk color that stays apart from the area around it from end to end.

The side veins are what make a leaf read as a leaf; a trunk alone does not. Each half needs side veins that can be seen. Plan them inside the part: a vein that runs along the edge or a crease is painted over by the edge or crease color and vanishes, and side veins that start in the narrow base run straight into the edge. Start them where the part is wide, point them forward, and end them at least a pixel inside the edge. Check the plan before coloring: print the part mask as text with the trunk and side vein pixels marked by letters, and look for vein letters on edge pixels.

**Silhouette.** After a shape is turned into pixels and before coloring, clean it with `P.smoothEdge` (or `P.smoothMask` per part). One pixel bumps and two pixel nubs look bad.

**Outline and rim.** When the shape does not read well at 1x, or the user says something is missing, show three versions side by side, with no outline, with `P.selout`, and with `P.rimLight` then `P.selout`, and let the user pick. Before showing, check that the rim really lit the sprite's own edge pixels on the light side. The outline takes its colors from the sprite's own ramp.

For simple objects drawn directly in code, show one version and ask:

> "Is this close to what you want, or should I change something?"

Change what the user points at and show it again.

## 4. Effects (fire, smoke, beams, explosions)

Effects are not drawn from a reference. You build them in code, frame by frame. Do not turn a photo or a video of the real thing into pixels for an effect, not even to make it look realistic. Start from the effects in `core/pixel.js` when one fits:

- Give every pixel a value: heat for fire, density for smoke, brightness for light. Get it from noise that moves over time.
- Turn the value into a color with a ramp from dark to bright, ending in white for the hottest or brightest part.
- Where two colors of the ramp meet, mix them with a dither pattern instead of a hard edge.
- Add sparks and small particles that fly out and fade.
- For fire that flows, like a dragon breathing, use a heat grid that spreads forward each frame and cools down, the way old Doom fire works.
- For explosions: gather energy first, then a flash, shock rings, and smoke that rises and slowly thins out.
- For beams: show thin warning lines first, then the bright beam.

Ask the user what the effect should feel like and if they have an example (a game, a video, a picture), then show one short animation as a preview GIF. The sprite sheet and other game files come only after the user likes it. Change speed, size, color and brightness only when the user asks.

**When the user says "realistic".** This works for any effect: fire, smoke, steam, water, magic, explosions.

1. Think about how the real thing looks and moves before writing code, or ask the user for a video of it to watch. The video is only for looking at how it moves; the effect is still built in code. Fire narrows as it rises and tears into tongues that break off. Smoke grows wider as it rises, rolls and thins out. An explosion pushes out from a center.
2. Do not use a pixel-by-pixel simulation (the Doom fire grid) for this. Every pixel decides on its own, so the result looks grainy and noisy, not like one body.
3. Build one value per pixel from two parts: the shape of the real thing (wide at the bottom and narrow at the top for a flame) and noise that moves the way the material moves (up for fire and smoke, out from the center for an explosion). Let the noise and the sway grow toward the free end, so the base stays calm and the top breaks up.
4. Draw only where the value is above a cut. This gives a solid body with torn edges and pieces that break off by themselves.
5. Color it in flat bands with dither only where two bands meet. Keep the brightest part small, at the source. If it is too big, the effect turns into a white blob. Edges and tips get the darkest color.
6. Smoke, steam, fog and mist are not solid and do not glow. Make them see-through with `alpha`, with no bright core. They leave the source as a thin stream (`calm` near 0), curl and spread as they rise (`warp`, a profile that grows with height), and slowly thin out until they are gone. Give them a few very faint bands so the top fades instead of ending in a hard edge.
7. Add only a few particles. They are not the effect itself.
8. Check it on a frame sheet, and fix one thing at a time by changing the numbers.

`P.Flow`, `P.Flame` and `P.Smoke` are built this way. For a new effect, extend `P.Flow` instead of writing the loop again.

## 5. Scenes, props and realism

For scenes and props drawn in code (a river, a forest, a waterfall, a cave, a gem, a cart), follow these rules. They come from work the user had to correct many times.

1. **Look at reality first.** Before writing code, think about how the real thing looks and how fast it moves, and turn real speeds into pixels per frame from the scale of the scene. Water drifts, leaves barely move, a cart rolls at walking speed. Make motion slower rather than faster. Too fast is the most common mistake.
2. **Layers from far to near.** Sky, far forest, the main row, the subject, the near ground. Far layers get `haze`: less contrast and the color of the air.
3. **One light.** Use one light direction for the whole scene, top left unless the user says otherwise. Draw rock, earth and wood with `P.surface` and a height function, never as flat color with noise on it.
4. **Real trees.** Grow trees with `P.branchTree` and `P.conifer`, never as round blobs. Mix kinds and sizes, and put them close enough to overlap.
5. **Water.** Water mirrors what is above it (`P.reflect`) and its ripples move slowly. Mist and spray are see-through.
6. **Seamless loops.** Everything that moves is back at its start after the last frame:
   - noise with `P.loopNoise`;
   - a scrolling layer is a `P.WBuf` as wide as its period that moves exactly one period per loop, so its speed is period / frames;
   - anything that repeats needs a whole number of repeats in the loop: a wheel radius where one loop turns it by a whole number of spoke steps, a walk cycle length that divides the frame count, a sway frequency that is a whole number.
   Look at the last frame next to the first.
7. **Camera.** When the camera moves sideways, near layers move faster than far ones and the sky stays still. For a smooth camera, build the frame S times bigger (4 is good) and draw each layer with `P.blitScaled` at its own shift. Only the camera is smooth: objects, wheels, leaves and characters stay on their own pixel grid unless the user asks otherwise.
8. **Small motion stays small.** Leaves move by a few pixels at the edges of the crowns (`P.leafFlicker`), never the whole crown, and never the whole tree shifted. Grass sways by a pixel or two.
9. **Gems, glass and crystal.** Use `P.Gem`. Light comes from strips with dark gaps between them, so the facets alternate between dark and bright. Pick each pixel's color as the nearest palette color, not by brightness alone, so the color stays red or blue in the shadows. Keep the bright parts small.
10. **Long loops.** For long smooth loops, save an MP4 with ffmpeg at 50 fps. Make the GIF at a lower frame rate and size, shrink it with ffmpeg `palettegen`, and tell the user its size.

**Animals and vehicles with no reference.** Ask for a reference first (section 1). If the user wants it from code anyway:

1. Search the internet for how the real thing moves: studies and animation guides in text, not photos. Find the order of the legs, how long each foot stays on the ground, and which joints bend and when. Use those numbers. For a horse:
   - a walk has four beats (left hind, left front, right hind, right front), and each foot is on the ground about 60% of the cycle;
   - a trot moves the diagonal pairs together, and each foot is down about 40% of the cycle;
   - a leg on the ground is straight and the fetlock sinks under the weight;
   - a front leg that lifts folds its hoof back under the knee;
   - the hock points back.
2. Pick the gait from the speed. Slow is a walk. A trot at walking speed looks like slow motion.
3. Take proportions from real measurements. For a horse, the body is about as long as the horse is tall at the shoulder, the leg up to the elbow is as long as the body is deep, and the head is about a third of the height. Build the body with `P.solid` and the legs with `P.ik`.
4. A foot on the ground moves with the ground, at the speed of the layer it stands on, or it slides.
5. Draw the subject 3 or 4 times bigger and check every frame of one cycle before putting it in the scene. Look for feet shaped like an "L", joints bending the wrong way, and a hip sticking out of the back.
6. Wheels have thin spokes with gaps between them, a thin iron rim and a small hub, so they don't look like shields.

## Realistic materials

These rules come from a long session where a realistic beach wave took many rounds to get right. They hold for any material or scene asked to look real, not only water. Follow them from the first version, so the user does not have to point out each mistake.

1. **If the user gave a reference, put it on the sheet.** Every preview sheet then shows it next to your frames, so each round is compared with what the user wants, not with the last version.
2. **Keep real colors muted.** Real materials are much less saturated than colors picked by feel; bright guessed colors make the result look like a cartoon. Build each ramp with `P.hueRamp` at low saturation (about 0.2 to 0.4 for water, sand, rock and sky). When the user gave a photo, crop each part of it (water, foam, wet sand, dry sand, sky), get its colors with `P.quantize(P.crop(ref, x, y, w, h), 5).palette` and pass them to `P.hueRampFrom(colors, n)`, which builds a hue shifted ramp with their hue, saturation and lightness range. Do not use the photo colors as the ramp: they only change in lightness and carry the camera's noise, so the result looks flat.
3. **Show it the way a camera would see it.** A cutaway (a slice of the sea seen from the side, a cross-section of the ground) always looks like a game, never like a photo. If the user asks for realism and the chosen view is a cutaway, say so and suggest the camera view.
4. **Brightness comes from the shape of the surface.** Build a height field (a few wave trains in different directions, bumps, ripples) and light every pixel from its slope: a face turned to the sky or the sun is light, a face turned to the viewer is dark. Water reflects by slope, foam is lit on top and shaded below, sand has low relief. Do not color by depth or distance alone in flat bands; that gives stripes.
5. **Texture has a real size.** Work out how big each detail is in the world (a ripple, a grain, a crack) and how many pixels that is at its distance. Nothing should be far bigger than real (ripples stretched into long stripes) or smaller than a pixel. When a detail gets smaller than about 2 pixels in the distance, fade it out and replace it with a fine streak texture, or it turns into grain.
6. **No per-pixel random grain.** Random speckles (salt and pepper) on sand, rock or water look like noise, not material. Use smooth noise and lighting instead.
7. **Soft things have soft edges.** Foam, spray, mist, shallow water and smoke are see-through at their edges: mix them into what is behind with a few alpha steps instead of drawing solid white pixels with hard edges.
8. **Dither only at the edges of bands.** On a wide flat area a dither pattern makes rows of dots that look like dotted lines. If an area already has texture, turn dither off there (width 0).
9. **One thing, one look.** When the same thing is drawn by two pieces of code one after the other (a wave crest that becomes foam, the last frame of a loop that becomes the first), both must use the same noise seed, the same size and the same colors at the moment they hand over. Anything that ends must fade out over several frames, not vanish in one.
10. **Build it from its real structure.** Find out what the thing is made of and build that, not a texture that looks a bit like it. A cumulus cloud is a cluster of rising puffs with a flat base at the height where vapor condenses and a domed top; foam is a mass of bubbles; rock is blocks split by cracks. Noise thresholds and volume fog are a good fit for smoke and mist, but at small sizes they turn clouds into flat blobs and bands.
11. **Draw small and distant detail bigger, then shrink it.** Render at 3 times the size and average each 3x3 block down before mapping to the palette. Puffs and grains smaller than a pixel then stay as broken pieces instead of melting into a solid band.
12. **Measure motion.** Follow "Motion speed" below for every moving part, and fix pops at hand-overs and loop seams before showing.

## 6. Characters drawn from scratch

When there is no reference, build characters from only a few pixels. Small characters drawn from scratch look good, big detailed ones look bad. If the user asks for a big detailed character without a reference, tell them this and ask for a reference, or ask if they still want it. Big detailed subjects are fine when they come from a reference.

## Real physics

Guessed motion is wrong in both directions: first too fast, then too still after you slow it down. Take motion from the physics of the real thing instead:

1. **Set the units first.** Decide how many meters one pixel is (at each distance, if the scene has depth) and how many seconds one frame is (the GIF delay). Write both down.
2. **Get the law of motion, not a feeling.** For each moving thing find the formula or measured value that governs it, and look it up (text sources, studies, guides) when you do not know it. Examples:
   - water waves: deep water `ω = sqrt(g · k)`, so short ripples move slower but change faster than long ones; shallow water `c = sqrt(g · depth)`; a breaker height is about 0.8 of the water depth;
   - falling things: `y = ½ · g · t²`, with drag limiting the speed (rain about 9 m/s, snow about 1 m/s, sparks and spray slow down fast);
   - rising things: smoke and steam rise about 1 to 3 m/s and slow down as they cool and spread; a flame flickers about 10 times a second;
   - plants: branches and grass sway about once every 1 to 3 seconds, leaves faster and smaller;
   - animals and people: use the gait data from "Animals and vehicles" and real walking or running speeds.
3. **Real motion is mixed.** Real surfaces are many parts moving in different directions at their own speeds (wave trains from several directions, gusts, eddies). One noise pattern that slides in one direction looks like a moving picture, not like the material.
4. **Hand-overs keep their speed.** When one phase of a motion turns into the next (a wave that breaks and becomes a rolling foam bore, a bore that runs up the beach, a jump that ends in a landing), the speed at the end of one phase must match the speed at the start of the next. Slowing to a stop with an ease-out and then starting fast again looks wrong. Give every phase its physical curve: ballistic for anything thrown or running up a slope (fast start, slows to a stop at the top), falling for anything coming down (slow start, speeds up), a steady fade for things that run out of energy.
5. **Sizes follow physics too.** Things grow or shrink at real rates and to real limits. A broken wave's foam drops to about half the wave's height and then shrinks with the water depth; it never swells up and down. Write each size curve as a formula and print its values per frame before rendering.
6. **Turn it into pixels per frame.** Speed in m/s × seconds per frame ÷ meters per pixel. For a loop, round each motion to a whole number of cycles per loop and recheck that the speed stayed close to the real value.
7. Then check it with "Motion speed" below.

## Motion speed

You cannot see what happens between frames, so speed mistakes get through (water that boils, foam that jitters, smoke that races). Check speed with numbers, not with your eyes:

1. Before rendering, work out how far every moving thing goes per frame and per second, and compare it with the real thing at the scale of the scene. For noise moved with time, the speed in pixels per frame is the time speed divided by the noise scale on that axis: `P.loopNoise(x * 0.1, y * 0.5, t, T, 0.05)` moves 0.05 / 0.5 = 0.1 pixels per frame. Surface texture (ripples, smoke detail, foam churn) usually moves well under 1 pixel per frame; above 1 it looks like boiling.
2. After rendering, measure how many pixels change from one frame to the next, for each part of the image (sky, water, ground, the subject):

```js
const changed = (a, b, y0, y1) => {
  let n = 0;
  for (let i = y0 * a.w; i < y1 * a.w; i++) if (a.px[i] !== b.px[i]) n++;
  return n / ((y1 - y0) * a.w);
};
```

A calm area that changes more than about 20% of its pixels every frame is moving too fast. A big jump in one frame only means something pops. Write the numbers down and fix the area that is off.
3. Put 4 frames in a row on the frame sheet so small steps can be compared, in addition to the spread of the whole loop.

## 7. Check before you show

- Render an image or frames and look at them yourself before showing the user.
- Never say a step is done without looking at the result.
- For an animation, look at a numbered frame sheet and at the last frame next to the first.
- Look at it at 1x, on a plain background, next to the zoomed view. The shape must read at 1x.
- After every step that changes the image (an effect, an outline, a rim light, a cleanup), count how many pixels it changed and where, by comparing its output with its input. Zero changes, or changes only on the wrong part, mean the step did not work, even when the code ran without errors.
- Measure, do not only look: `P.edgeCheck` must find no nubs, strips or holes in the silhouette; `P.colorCount` must show most of the ramp in use, with no color over half the object; band edges must show a dither strip; `P.partAreas` must show parts that repeat within about 15% of each other, unless the request says otherwise.
- Be your own critic. The user should never be the one who finds a flaw you could have seen. Before you show anything, look at the zoomed view and the 1x view as a strict reviewer would, next to the reference at the same scale when there is one, and write down the worst problems you see. If you find one, fix it and look again; show only when you cannot find one more. Never show a version you already know is bad. Ask every time:
  - Does one part stand out as bigger, smaller, darker or brighter than the parts like it?
  - Does each part read as its real shape at 1x (a heart, not a wedge or a pie slice)?
  - Does it have the inner structure written down in "Inner structure" (veins, ridges, seams), drawn as pixel-perfect lines in one color, not dashes or L steps, one ramp step from their surroundings, neither stripes nor bare? Can you follow the main vein from the base to the tip like a trunk, with side veins you can see branching off it on both halves?
  - Does a leaf, petal or cloth show its small relief, lit from the scene's light (grooves along the veins, one side lit), and not flat half-tones or a dome?
  - Can you name the reason for every tone patch inside a part (see "Order")? Patches that follow no structure are noise; remove them.
  - Does the layout read as a perfect cross, a grid or a pinwheel instead of something natural?
  - Is there an opening that reads as a hole, a nub, or a part that should touch and does not?
  - Are the palette's depth and saturation close to the reference's?
  - Compared with the version before, did the fix lose something good (shading, depth, structure)? Put the previous version on the sheet next to the new one and look.
- When the user says something is too much or too little, change it by about half, not all the way to the other end. Going all the way swaps one flaw for the opposite one (too much noise becomes flat, too many veins become none). Look at the new version between the one before and the one before that.
- Check that every part follows the same light direction, and that parts which should touch do.
- Do only what was asked. Do not add text, effects, colors or features on your own.
- When the user says something is wrong, change that one thing by a measured step, show it again, and ask again.
