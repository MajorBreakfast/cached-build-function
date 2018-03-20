# Image Resizing Example

- `npm install`
- `npm run build`
- The `cache/` folder will contain some cache entries
- The `resized-images/` folder will contain the resized images

Take a look at [build.js](https://github.com/MajorBreakfast/cached-build-function/blob/master/example/image-resizing/build.js) to see the code.

## Output

First time:
```
Started resizing images
Use cache for 0, need to resize 3 images
Resized "images/owl1.jpg"
Resized "images/owl2.jpg"
Resized "images/owl3.jpg"
Finished resizing images
Image "owl2.jpg" is now 200x150
Image "owl1.jpg" is now 200x132
Image "owl3.jpg" is now 174x200
```

Subsequent times:
```
Started resizing images
Use cache for 3, need to resize 0 images
Finished resizing images
Image "owl1.jpg" is now 200x132
Image "owl3.jpg" is now 174x200
Image "owl2.jpg" is now 200x150
```
