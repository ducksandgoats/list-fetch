const makeFetch = require('make-fetch')
const streamToIterator = require('stream-async-iterator')
const mime = require('mime/lite')
const parseRange = require('range-parser')
const Torrentz = require('torrentz')
const path = require('path')

module.exports = async function makeBTFetch (opts = {}) {
  const DEFAULT_OPTS = {}
  const finalOpts = { ...DEFAULT_OPTS, ...opts }
  // const checkHash = /^[a-fA-F0-9]{40}$/
  // const checkAddress = /^[a-fA-F0-9]{64}$/
  // const checkTitle = /^[a-zA-Z0-9]/
  const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE', 'HEAD']
  const encodeType = 'hex'
  const hostType = '_'

  const app = await new Promise((resolve) => {if(finalOpts.torrentz){resolve(finalOpts.torrentz)}else{resolve(new Torrentz(finalOpts))}})

  // const prog = new Map()

  function takeCareOfIt(data){
    console.log(data)
    throw new Error('aborted')
  }

  function htmlIden(data){
    if(data.id.length === 64){
      data.kind = 'address'
      data.link = `<a href='bt://${data.address}/'>${data.address}</a>`
    } else if(data.id.length === 40){
      data.kind = 'infohash'
      data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`
    } else if(data.id.length === 20){
      data.kind = 'title'
      data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`
    }
    return `<p>${JSON.stringify(data)}</p>`
  }

  function jsonIden(data){
    if(data.id.length === 64){
      data.kind = 'address'
      data.link = `bt://${data.address}/`
    } else if(data.id.length === 40){
      data.kind = 'infohash'
      data.link = `bt://${data.infohash}/`
    } else if(data.id.length === 20){
      data.kind = 'title'
      data.link = `bt://${data.infohash}/`
    }
    return data
  }

  function htmlDir(data){
    if(data.name.length === 64){
      data.kind = 'address'
    } else if(data.name.length === 40){
      data.kind = 'infohash'
    } else if(data.name.length === 20){
      data.kind = 'title'
    } else {
      data.kind = 'other'
    }
    if(data.isDirectory()){
      data.type = 'directory'
    } else if(data.isFile()){
      data.type = 'file'
    } else {
      data.type = 'other'
    }
    return `<p>${JSON.stringify(data)}</p>`
  }

  function jsonDir(data){
    if(data.name.length === 64){
      data.kind = 'address'
    } else if(data.name.length === 40){
      data.kind = 'infohash'
    } else if(data.name.length === 20){
      data.kind = 'title'
    } else {
      data.kind = 'other'
    }
    if(data.isDirectory()){
      data.type = 'directory'
    } else if(data.isFile()){
      data.type = 'file'
      return {type: 'file', name: data.name, id: data.kind}
    } else {
      data.type = 'other'
    }
    return data
  }

  // function htmlAuthor(arr){
  //   return arr.map((data) => {
  //     for()
  //   })
  // }

  function getMimeType (path) {
    let mimeType = mime.getType(path) || 'text/plain'
    if (mimeType.startsWith('text/')) mimeType = `${mimeType}; charset=utf-8`
    return mimeType
  }

  function formatReq (hostname, pathname) {

    // let mainType = hostname[0] === hostType || hostname[0] === sideType ? hostname[0] : ''
    const mainQuery = hostname[0] === hostType ? hostname[0] : ''
    const mainHost = hostname.replace(mainQuery, '')
    // if(pathname){
    //     console.log(decodeURIComponent(pathname))
    // }
    const mainPath = decodeURIComponent(pathname)
    return { mainQuery, mainHost, mainPath }
  }

  const fetch = makeFetch(async (request) => {
    // if (request.body !== null) {
    //   request.body = await getBody(request.body)
    //   try {
    //     request.body = JSON.parse(request.body)
    //   } catch (error) {
    //     console.log(error)
    //   }
    // }

    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    try {
      const { hostname, pathname, protocol, search, searchParams } = new URL(url)
      const mainHostname = hostname && hostname.startsWith(encodeType) ? Buffer.from(hostname.slice(encodeType.length), 'hex').toString('utf-8') : hostname

      let isItBad = false
      const badObj = {}
      if (protocol !== 'bt:') {
        isItBad = true
        badObj.statusCode = 409
        badObj.headers = {}
        badObj.data = ['wrong protocol']
      } else if (!method || !SUPPORTED_METHODS.includes(method)) {
        isItBad = true
        badObj.statusCode = 409
        badObj.headers = {}
        badObj.data = ['something wrong with method']
      } else if ((!mainHostname) || (mainHostname.length === 1 && mainHostname !== hostType)) {
        isItBad = true
        badObj.statusCode = 409
        badObj.headers = {}
        badObj.data = ['something wrong with hostname']
      }
      if(isItBad){
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        return badObj
      }

      const mid = formatReq(decodeURIComponent(mainHostname), decodeURIComponent(pathname))

      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

      if(method === 'HEAD'){
        const mainObj = {}
        if (mid.mainQuery) {
          mainObj.statusCode = 400
          mainObj.headers = {'Content-Length': '0'}
          mainObj.data = []
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
          if (torrentData) {
            if(torrentData.infoHash){
              const useHeaders = {}
              // useHeaders['Content-Type'] = mid.mainRes
              useHeaders['Content-Length'] = `${torrentData.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${torrentData.downloaded}`

              mainObj.statusCode = 200
              mainObj.headers = useHeaders
              mainObj.data = []
            } else if(Array.isArray(torrentData)){
              let checkLength = 0
              torrentData.forEach((data) => {checkLength = checkLength + data.length})

              mainObj.statusCode = 200
              mainObj.headers = {'Content-Length': String(checkLength)}
              mainObj.data = []
            } else {
              const useHeaders = {}
              useHeaders['Content-Type'] = getMimeType(torrentData.path)
              useHeaders['Content-Length'] = `${torrentData.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${torrentData.downloaded}`

              mainObj.statusCode = 200
              mainObj.headers = useHeaders
              mainObj.data = []
            }
          } else {
            mainObj.statusCode = 400
            mainObj.headers = {'Content-Length': '0'}
            mainObj.data = []
          }
        }
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        return mainObj
      } else if(method === 'GET'){
        const mainObj = {}
        if (mid.mainQuery) {
          if(reqHeaders['x-id'] || searchParams.has('x-id')){
            if(JSON.parse(reqHeaders['x-id'] || searchParams.get('x-id'))){
              const torrentData = await app.listDirectory(true)
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map(htmlIden)}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonIden))]
            } else {
              const torrentData = await app.listDirectory(false)
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map((data) => {return `<p><a href='bt://${data}/'>${data}</a></p>`})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {return `bt://${data}/`}))]
            }
          } else if(reqHeaders['x-dir'] || searchParams.has('x-dir')){
            if(JSON.parse(reqHeaders['x-dir'] || searchParams.get('x-dir'))){
              const torrentData = await app.getDirectory(true)
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map(htmlDir)}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonDir))]
            } else {
              const torrentData = await app.getDirectory(false)
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map((data) => {return `<p>${data}</p>`})}</div></body></html>`] : [JSON.stringify(torrentData)]
            }
          } else if(reqHeaders['x-auth'] || searchParams.has('x-auth')){
            if(JSON.parse(reqHeaders['x-auth'] || searchParams.get('x-auth'))){
              const torrentData = await app.getAuthor()
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map((data) => {return `<p><a href='bt://${data}/'>${data}</a></p>`})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {return `bt://${data}/`}))]
            } else {
              const torrentData = await app.getAuthor()
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes}
              mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map((data) => {return `<p>${data}</p>`})}</div></body></html>`] : [JSON.stringify(torrentData)]
            }
          } else {
            const torrentData = await app.listAuthor()
            mainObj.statusCode = 200
            mainObj.headers = {'Content-Type': mainRes}
            mainObj.data = mainReq ? [`<html><head><title>/</title></head><body><div>${torrentData.map((data) => {if(data.address){data.link = `<a href='bt://${data.address}/'>${data.address}</a>`} else if(data.title){data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`} return `<p>${JSON.stringify(data)}</p>`;})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {if(data.address){data.link = `bt://${data.address}/`} else if(data.title){data.link = `bt://${data.infohash}/`} return data;}))]
          }
        } else {
          const mainRange = reqHeaders.Range || reqHeaders.range
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
          if(torrentData){
            if(torrentData.infoHash){
              mainObj.statusCode = 200
              mainObj.headers = {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}
              mainObj.data = mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.files.map(file => { return file.urlPath }))]
            } else {
              if(Array.isArray(torrentData)){
                let checkLength = 0
                torrentData.forEach((data) => {checkLength = checkLength + data.length})

                mainObj.statusCode = 200
                mainObj.headers = {'Content-Type': mainRes, 'Content-Length': String(checkLength)}
                mainObj.data = mainReq ? [`<html><head><title>Directory</title></head><body><div><h1>Directory</h1><p><a href='../'>..</a></p>${torrentData.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.map(file => { return file.urlPath }))]
              } else {
                if (mainRange) {
                  const ranges = parseRange(torrentData.length, mainRange)
                  if (ranges && ranges.length && ranges.type === 'bytes') {
                    const [{ start, end }] = ranges
                    const length = (end - start + 1)

                    mainObj.statusCode = 206
                    mainObj.headers = {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}
                    mainObj.data = streamToIterator(torrentData.createReadStream({ start, end }))
                  } else {
                    mainObj.statusCode = 416
                    mainObj.headers = {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}
                    mainObj.data = ['range is not satisfiable']
                  }
                } else {
                  mainObj.statusCode = 200
                  mainObj.headers = {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}
                  mainObj.data = streamToIterator(torrentData.createReadStream())
                }
              }
            }
          } else {
            mainObj.statusCode = 400
            mainObj.headers = mainRes
            mainObj.data = mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>could not find the data</p></div></body></html>`] : [JSON.stringify('could not find the data')]
          }
        }
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        return mainObj
      } else if(method === 'POST'){
        const mainObj = {}
        if(!body){
          mainObj.statusCode = 400
          mainObj.headers = mainRes
          mainObj.data = mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>must have a body</p></div></body></html>`] : [JSON.stringify('must have a body')]
        } else {
          const useOpts = {
            count: reqHeaders['x-version'] || searchParams.has('x-version') ? Number(reqHeaders['x-version'] || searchParams.get('x-version')) : null,
            timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0,
            opt: reqHeaders['x-opt'] || searchParams.has('x-opt') ? JSON.parse(reqHeaders['x-opt'] || decodeURIComponent(searchParams.get('x-opt'))) : null
          }
          if (mid.mainQuery) {
            if(JSON.parse(reqHeaders['x-update']) || JSON.parse(searchParams.has('x-update'))){
              const torrentData = await app.publishTorrent({address: null, secret: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)

              mainObj.statusCode = 200
              mainObj.headers = {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}
              mainObj.data = mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]
            } else {
              const torrentData = await app.publishTorrent({infohash: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)

              mainObj.statusCode = 200
              mainObj.headers = {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Title': torrentData.title}
              mainObj.data = mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>infohash: ${torrentData.infohash}</p><p>title: ${torrentData.title}</p></div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]
            }
          } else {
            if(reqHeaders['x-authentication'] || searchParams.has('x-authentication')){
            const torrentData = await app.publishTorrent({address: mid.mainHost, secret: reqHeaders['x-authentication'] || searchParams.get('x-authentication')}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)

            mainObj.statusCode = 200
            mainObj.headers = {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Authentication': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}
            mainObj.data = mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div><div>${torrentData.files.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]
            } else {
              const torrentData = await app.publishTorrent({infohash: mid.mainHost}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)

              mainObj.statusCode = 200
              mainObj.headers = {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Title': torrentData.title}
              mainObj.data = mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>infohash: ${torrentData.infohash}</p><p>title: ${torrentData.title}</p></div><div>${torrentData.files.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]
            }
          }
        }
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        return mainObj
      } else if(method === 'DELETE'){
        const mainObj = {}
        if (mid.mainQuery) {
          mainObj.statusCode = 400
          mainObj.headers = {'Content-Type': mainRes}
          mainObj.data = mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>must not use underscore</p></div></body></html>'] : [JSON.stringify('must not use underscore')]
        } else {
          const torrentData = await app.shredTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || Number(searchParams.get('x-timer'))) : 0})

          mainObj.statusCode = 200
          mainObj.headers = {'Content-Type': mainRes}
          mainObj.data = mainReq ? [`<html><head><title>${mid.mainHost}${mid.mainPath}</title></head><body><div><p>${torrentData.type}: ${torrentData.id}</p><p>path: ${torrentData.path}</p><p>link: bt://${torrentData.id}/</p></div></body></html>`] : [JSON.stringify({id: torrentData.id, tid: torrentData.id, type: torrentData.type, path: torrentData.path, link: `bt://${torrentData.id}/`})]
        }
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        return mainObj
      } else {
        if(signal){
          signal.removeEventListener('abort', takeCareOfIt)
        }
        
        return {statusCode: 400, headers: { 'Content-Type': mainRes }, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>method is not supported</p></div></body></html>'] : [JSON.stringify('method is not supported')]}
      }
    } catch (e) {
      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
      const useCode = e.name === 'ErrorTimeout' ? 408 : 500
      if(signal){
        signal.removeEventListener('abort', takeCareOfIt)
      }

      return {statusCode: useCode, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${e.name}</title></head><body><div><p>${e.stack}</p></div></body></html>`] : [JSON.stringify(e.stack)]}
    }
  })

  fetch.close = async () => {
    return await new Promise((resolve, reject) => {
      app.webtorrent.destroy(error => {
        if (error) {
          reject(error)
        } else {
          app.checkId.clear()
          clearInterval(app.updateRoutine)
          resolve()
        }
      })
    })
  }

  return fetch
}