# Standee Alchemy

A static, client-side standee PDF generator. It uses only browser APIs: no build step, no Node packages, no server-side processing.

## Use

Open `index.html` in a browser, add images, choose a width, image scale, and quantity for each image, then generate and download the PDF.
Use Save State and Load State to export and restore a `.standee-alchemy.json` file with the current settings, images, widths, scales, and quantities.

Print the PDF at actual size / 100% scale. The page margin setting reserves space for printers that cannot print to the edge.

Pieces are always arranged for straight cuts across a page or an already cut fragment, making them suitable for paper cutters.

## Output Shape

For each image, the app creates one vertical piece:

- Outer top rectangle: one eighth of the chosen image width, capped at 0.25 inch high
- Inner top rectangle: half of the chosen image width
- Upside-down copy of the image
- Original image
- Inner bottom rectangle: half of the chosen image width
- Outer bottom rectangle: one eighth of the chosen image width, capped at 0.25 inch high

The image height is calculated from the original aspect ratio after applying the image scale. Scaling below 100% centers the image inside the chosen output width and adds white padding on both sides. Scaling above 100% increases the image height and crops the sides evenly to keep the chosen output width. If the image would be shorter than `sqrt(2) / 2` times its chosen width, white padding is added above the image until it reaches that height.
The image filename (without its extension) is printed as the character name below the character, centered between the image fold and the + mark. Long names shrink to fit. When quantity exceeds one, copies are numbered from 1 in the least obstructive corner of each character image, preferring white space. The corner is chosen per creature after image scaling and cropping, shared by all its copies, and oriented with each image. Numbers use black text with a white outline, sized from 7 to 12 points according to the chosen output width.
When guides are enabled, the lines between the outer rectangles and the rest of the piece include a small halfway mark.

If the normal piece is too tall for the printable A4 area, the app automatically switches that image to fallback pieces and marks this in the image row and layout status. The first fallback keeps the two images connected, adds two 0.5 inch rectangles above and below that body, and moves the base to a separate piece. If that is still too tall, the app prints two separate single-image pieces plus the separate base. In fallback pieces, the outer tabs beyond the + marks are shortened from 0.5 inch to 0.25 inch.

## Notes

- A4 page size is supported.
- The layout uses a fast rectangle-packing heuristic and reports an error when a piece cannot fit on the printable area by itself.
- Uploaded images are flattened onto a white background when rendered into the PDF.
- PDF rendering defaults to 600 DPI and uses progressive downsampling and mild sharpening for cleaner output.

## Checks

Run `node tests/app.test.cjs` with Node.js 18 or newer. The dependency-free regression checks cover packing boundaries and spacing, quantity defaults, empty layouts, PDF generation lifecycle, and overlapping state loads. Browser rendering and image decoding still need a browser smoke test.
