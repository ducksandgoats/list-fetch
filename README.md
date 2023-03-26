# list-fetch

example of how a url looks like using list-fetch
`bt://someAddressOrInfohashAsHostname/some/path`

`_` - does different things depending on the http method
`address` - a public key that is 64 characters that is used as an address
`infohash` - a identifier for torrents that is 40 characters

method: `HEAD` - does not return a body, only returns headers<br>
hostname:

- `_` - user's own data<br>
  path:
  - `/` - if path is `/` then it returns data about the current torrents, if no headers are used, then it returns the byte size and count of all of the authored torrents<br>
    headers:
    - `X-Data` - `true` | `false` - if true, it returns the byte size and count of all the torrents, if false, it returns only the count of all the torrents<br>
  - `/path/to/dir/or/file` - if path is not `/` then it returns data in the headers about the user directory that is local and not publically shared<br>
- `address` | `infohash` - a torrent you want to load<br>
  path:
  - `/any/path/to/dir/or/file` - it can be any path including `/`, if no headers, it returns the byte size, link, and other data of the torrent in the headers<br>
    headers:
    - `X-Copy` - `true` | `false` - if true, copies a file and saves it to the user directory(with the address or infohash as the directory name, it is publically shared) on the local disk, if false, copies a file and saves it to the user directory(it is publically shared) on the local disk<br>
    - `X-Timer` - `String` - a number for a timeout<br>

method: `GET` - return a body<br>
hostname:

- `_` - user's own data<br>
  path:
  - `/` - if path is `/` then it is same as `HEAD`, in addition, it also sends a body. if there are no headers, then only author data is returned<br>
    headers:
    - `X-Data` - `true` | `false` - if true, it returns the byte size and count of all the torrents, if false, it returns only the count of all the torrents<br>
  - `/path/to/dir/or/file` - if path is not `/` then it is the same as `HEAD`, in addition, it also sends a body<br>
- `address` | `infohash` - a torrent you want to load<br>
  path:
  - `/any/path/to/dir/or/file` - it can be any path including `/`, if no headers, it returns the byte size, link, and other data in the headers<br>
    headers:
    - `Range` - if path is a file, it returns the data from a file that fits this range<br>
    - `X-Timer` - `String` - a number for a timeout<br>

method: `POST` - return a body<br>
hostname:

- `_` - make a new torrent<br>
  path:
  - `/path/to/dir/or/file` - any path, this is where the files will go for the torrent<br>
    body:
  - `FormData` | `String` - either FormData which will hold the files or some string for a single file<br>
    headers:
  - `X-Update` - `true` | `false` - if true, a mutable BEP46 torrent, if false, an immutable regular torrent<br>
  - `X-Version` - `String` - what sequence to use for the torrent<br>
  - `X-Opt` - `String` - options to use for the content, stringified object<br>
- `address` | `infohash` - an already existing torrent that you want to modify<br>
  path:
  - `/path/to/dir/or/file` - any path, this is where the files will go for the torrent<br>
    body:
  - `FormData` | `String` - either FormData which will hold the files or some string for a single file<br>
    headers:
  - `X-Version` - `String` - what sequence to use for the torrent<br>
  - `X-Opt` - `String` - options to use for the content, stringified object<br>

method: `DELETE` - returns a body<br>
hostname:

- `_` - delete user directory data<br>
  path:
  - `/path/to/dir/or/file` - any path, this is where the files will go for the torrent<br>
- `address` | `infohash` - an already existing torrent to delete entirely or modify<br>
  path:
  - `/path/to/dir/or/file` - any path, if `/` then entire torrent is delete, if not `/`, then only the path is deleted and a new torrent is made
    headers:
  - `X-Opt` - `String` - options to use for the content, stringified object<br>
