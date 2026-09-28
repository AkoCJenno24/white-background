# White Background

A minimal browser app: choose or drop a JPG, PNG, or WebP image, remove its background, composite the subject onto opaque white, and download a full-resolution JPG at 98% quality. Downloads retain the uploaded filename, changing the extension to .jpg when needed.

## Run

```sh
npm install
npm run dev
```

Build: `npm run build`. Preview the production build: `npm run preview`.

Image processing runs locally with IMG.LY's background-removal library. The first run downloads the model and runtime from IMG.LY; an internet connection is needed. Quality depends on the photo. Images are limited to 20 MB, 25 megapixels, and 8192 pixels per side to constrain browser memory use.

The background-removal dependency is AGPL-3.0 licensed; see its package license for redistribution obligations and IMG.LY for commercial licensing.

## Batch processing

Select or drop multiple files. Images run sequentially, and a failed image does not stop the rest. Click any row to preview its result or download its JPG. Use **Retry failed images** to retry failures and **Download all (ZIP)** to save completed images together. Identical filenames are preserved in numbered subfolders in the ZIP, preventing overwrites. Limits: 50 images and 200 MB of input per batch. Download your results before clearing the batch or refreshing the page.

## Alpha-mask correction

Processing uses the higher-precision `isnet_fp16` model. The smaller quantized model produced background speckling and holes in pale product labels on the supplied bottle photo; the higher-precision model was visually checked at the original 3072 × 4080 resolution. The initial model download is larger. JPG quality and original filenames are unchanged.

The pinned IMG.LY 1.7.0 dependency is patched by `scripts/patch-background-removal.mjs` on install, development startup, and build. Model predictions are clamped before conversion to 8-bit alpha to prevent overflow/underflow from creating holes in the subject and speckles in the background. RGB data and soft-edge alpha values inside the valid range are unchanged. The patch fails explicitly if a dependency update changes the conversion code. Run `npm test` for alpha bounds and batch regression checks.

## Opaque product accuracy

**Box / tin cleanup** is enabled by default for a single convex opaque box or tin. It refines the model mask at up to 1024 pixels: remove thin connections, keep the largest connected region, fill enclosed mask holes, and restore opacity inside the product. Full-resolution colors/text come from the original photo, then composite onto white. This is not appropriate for shaped bottles, hair, transparent packaging, handles, or multiple objects: turn the option off for those images. This heuristic may remove genuine narrow protrusions; always inspect the preview. Choose the setting before upload, or change it and click **Reprocess selected** for an existing result. Reprocessing preserves the previous result if it fails; the ZIP uses the latest successful result. Use the original photo, since already-exported white areas cannot restore missing detail.
For sparse or fragmented opaque-package masks, cleanup reconstructs the outer convex envelope before restoring the interior. This assumption is suitable for these tins and boxes; switch cleanup off for concave or multi-part products.


### Straight box edge refinement

Tall boxes with four well-supported, nearly straight edges are refined using color gradients in the original photo around the model's approximate bounds. Robust line fitting rejects inconsistent evidence. The outside of colored rim transitions is used to avoid clipping the rim. A full-resolution antialiased polygon is drawn from those edges instead of enlarging the low-resolution binary mask. Other shapes retain the existing cleanup path. This improves the clipped upper-right edge of 44000941; it does not change product exposure or JPEG settings.
Bottom box rims are traced as a gently curved exterior contour rather than requiring a straight line. Local exterior-gradient samples and short-gap bridging prevent switches to the inner rim from cutting a notch into the product. Large or inconsistent contour changes are rejected. Regression tests cover bowed rims and short inward edge switches.
