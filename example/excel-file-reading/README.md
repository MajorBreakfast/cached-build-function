# Excel File Reading Example

- `npm install`
- `npm run build`
- The `cache/` folder will contain some cache entries

Take a look at [build.js](https://github.com/MajorBreakfast/cached-build-function/blob/master/example/excel-file-reading/build.js) to see the code.

## Output

First time:
```
Started reading Excel file
Finished reading Excel file
[ { firstName: 'Eleven' },
  { firstName: 'Will', lastName: 'Byers' },
  { firstName: 'Mike', lastName: 'Wheeler' },
  { firstName: 'Dustin', lastName: 'Henderson' },
  { firstName: 'Lucas', lastName: 'Sinclair' },
  { firstName: 'Nancy', lastName: 'Wheeler' },
  { firstName: 'Steven', lastName: 'Harrington' },
  { firstName: 'Jonathan', lastName: 'Byers' },
  { firstName: 'Joyce', lastName: 'Byers' },
  { firstName: 'Jim', lastName: 'Hopper' } ]
```

Subsequent times:
```
Started reading Excel file
Used cache
Finished reading Excel file
[ { firstName: 'Eleven' },
  { firstName: 'Will', lastName: 'Byers' },
  { firstName: 'Mike', lastName: 'Wheeler' },
  { firstName: 'Dustin', lastName: 'Henderson' },
  { firstName: 'Lucas', lastName: 'Sinclair' },
  { firstName: 'Nancy', lastName: 'Wheeler' },
  { firstName: 'Steven', lastName: 'Harrington' },
  { firstName: 'Jonathan', lastName: 'Byers' },
  { firstName: 'Joyce', lastName: 'Byers' },
  { firstName: 'Jim', lastName: 'Hopper' } ]
```
