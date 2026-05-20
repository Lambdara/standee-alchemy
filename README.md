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

The image height is calculated from the original aspect ratio.

Set an image quantity to `0` to remove that image.

## Notes

- A4 page size is supported.
- The layout uses a fast rectangle-packing heuristic and reports an error when a piece cannot fit on the printable area by itself.
- Uploaded images are flattened onto a white background when rendered into the PDF.
- PDF rendering uses progressive downsampling and mild sharpening for cleaner 300 DPI output.
