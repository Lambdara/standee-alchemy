# Standee Alchemy

A static, client-side standee PDF generator. It uses only browser APIs: no build step, no Node packages, no server-side processing.

## Use

Open `index.html` in a browser, add images, choose a width and quantity for each image, then generate and download the PDF.

Print the PDF at actual size / 100% scale. The page margin setting reserves space for printers that cannot print to the edge.

## Output Shape

For each image, the app creates one vertical piece:

- Outer top rectangle: one quarter of the chosen image width, capped at 0.5 inch high
- Inner top rectangle: half of the chosen image width
- Upside-down copy of the image
- Original image
- Inner bottom rectangle: half of the chosen image width
- Outer bottom rectangle: one quarter of the chosen image width, capped at 0.5 inch high

The image height is calculated from the original aspect ratio. If the image would be shorter than `sqrt(2) / 2` times its chosen width, white padding is added above the image until it reaches that height.
When guides are enabled, the lines between the outer rectangles and the rest of the piece include a small halfway mark.

If the normal piece is too tall for the printable A4 area, the app automatically switches that image to fallback pieces and marks this in the image row and layout status. The first fallback keeps the two images connected, adds two 0.5 inch rectangles above and below that body, and moves the base to a separate piece. If that is still too tall, the app prints two separate single-image pieces plus the separate base.

## Notes

- A4 page size is supported.
- The layout uses a fast rectangle-packing heuristic and reports an error when a piece cannot fit on the printable area by itself.
- Uploaded images are flattened onto a white background when rendered into the PDF.
- PDF rendering uses progressive downsampling and mild sharpening for cleaner 300 DPI output.
