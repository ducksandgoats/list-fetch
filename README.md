# list-Fetch

method: `HEAD` - does not return a body, only returns headers
hostname:
* `_` - user's own data
    path:
    * `/` - if path is `/` then it returns data about the current torrents, if no headers, then it returns the byte size and count of all of the authored torrents
        headers:
        * `X-Data` - `true` | `false` - if true, it returns the byte size and count of all the torrents, if false, it returns only the count of all the torrents
    * `/path/to/dir/or/file` - if path is not `/` then it returns data in the headers about the user directory that is local and not publically shared
* `address` | `infohash` - a torrent you want to load
    path:
    * `/any/path/to/dir/or/file` - it can be any path including `/`, if no headers, it returns the byte size, link, and other data in the headers
        headers:
        * `X-Copy` - `true` | `false` - if true, copies a file and saves it to the user directory(with the address or infohash as the directory name, it is publically shared) on the local disk, if false, copies a file and saves it to the user directory(it is publically shared) on the local disk

method: `GET` - return a body
hostname:
* `_` - user's own data
    path:
    * `/` - if path is `/` then it is same as `HEAD`, in addition, it also sends a body
        headers:
        * `X-Data` - `true` | `false` - if true, it returns the byte size and count of all the torrents, if false, it returns only the count of all the torrents
    * `/path/to/dir/or/file` - if path is not `/` then it is the same as `HEAD`, in addition, it also sends a body
* `address` | `infohash` - a torrent you want to load
    path:
    * `/any/path/to/dir/or/file` - it can be any path including `/`, if no headers, it returns the byte size, link, and other data in the headers
        headers:
        * `Range` - if path is a file, it returns the data from a file that fits this range

method: `POST` - return a body
hostname:
* `_` - make a new torrent
    path:
    * `/path/to/dir/or/file` - any path, this is where the files will go for the torrent
    body:
    * `FormData` | `String` - either FormData which will hold the files or some string for a single file
    headers:
    * `X-Update` - `true` | `false` - if true, a mutable BEP46 torrent, if false, a immutable regular torrent
    * `X-Version` - `String` - what sequence to use for the torrent
* `address` | `infohash` - an already existing torrent that you want to modify
    path:
    * `/path/to/dir/or/file` - any path, this is where the files will go for the torrent
    body:
    * `FormData` | `String` - either FormData which will hold the files or some string for a single file
    headers:
    * `X-Version` - `String` - what sequence to use for the torrent

method: `DELETE` - returns a body
hostname:
* `_` - delete user directory data
    path:
    * `/path/to/dir/or/file` - any path, this is where the files will go for the torrent
    headers:
    * `X-Update` - `true` | `false` - if true, a mutable BEP46 torrent, if false, a immutable regular torrent
    * `X-Version` - `String` - what sequence to use for the torrent
* `address` | `infohash` - an already existing torrent to delete entirely or modify
    path:
    * `/path/to/dir/or/file` - any path, if `/` then entire torrent is delete, if not `/`, then only the path is deleted and a new torrent is made