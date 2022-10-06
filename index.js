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

  function htmlDir(data){
    if(data.isDirectory()){
      return `<p>${JSON.stringify({type: 'directory', name: data.name, link: `bt://${data.name}/`})}</p>`
    } else if(data.isFile()){
      return `<p>${JSON.stringify({type: 'file', name: data.name, link: `bt://${data.name}/`})}</p>`
    } else {
      return `<p>${JSON.stringify({type: 'other', name: data.name, link: `bt://${data.name}/`})}</p>`
    }
  }

  function jsonDir(data){
    if(data.isDirectory()){
      return {type: 'directory', name: data.name, link: `bt://${data.name}/`}
    } else if(data.isFile()){
      return {type: 'file', name: data.name, link: `bt://${data.name}/`}
    } else {
      return {type: 'other', name: data.name, link: `bt://${data.name}/`}
    }
  }

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

  const fetch = makeFetch(async request => {
    // if (request.body !== null) {
    //   request.body = await getBody(request.body)
    //   try {
    //     request.body = JSON.parse(request.body)
    //   } catch (error) {
    //     console.log(error)
    //   }
    // }

    const { url, method, headers: reqHeaders, body } = request

    try {
      const { hostname, pathname, protocol, search, searchParams } = new URL(url)
      const mainHostname = hostname && hostname.startsWith(encodeType) ? Buffer.from(hostname.slice(encodeType.length), 'hex').toString('utf-8') : hostname

      if (protocol !== 'bt:') {
        return { statusCode: 409, headers: {}, data: ['wrong protocol'] }
      } else if (!method || !SUPPORTED_METHODS.includes(method)) {
        return { statusCode: 409, headers: {}, data: ['something wrong with method'] }
      } else if ((!mainHostname) || (mainHostname.length === 1 && mainHostname !== hostType)) {
        return { statusCode: 409, headers: {}, data: ['something wrong with hostname'] }
      }

      const mid = formatReq(decodeURIComponent(mainHostname), decodeURIComponent(pathname))

      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

      if(method === 'HEAD'){
        if (mid.mainQuery) {
          return { statusCode: 400, headers: {'Content-Length': '0'}, data: [] }
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
          if (torrentData) {
            if(torrentData.infoHash){
              const useHeaders = {}
              // useHeaders['Content-Type'] = mid.mainRes
              useHeaders['Content-Length'] = `${torrentData.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
              return {statusCode: 200, headers: useHeaders, data: []}
            } else if(Array.isArray(torrentData)){
              let checkLength = 0
              torrentData.forEach((data) => {checkLength = checkLength + data.length})
              return {statusCode: 200, headers: {'Content-Length': String(checkLength)}, data: []}
            } else {
              const useHeaders = {}
              useHeaders['Content-Type'] = getMimeType(torrentData.path)
              useHeaders['Content-Length'] = `${torrentData.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
              return {statusCode: 200, headers: useHeaders, data: []}
            }
          } else {
            return {statusCode: 400, headers: {'Content-Length': '0'}, data: []}
          }
        }
      } else if(method === 'GET'){
        const mainRange = reqHeaders.Range || reqHeaders.range
        if (mid.mainQuery) {
          const torrentData = await app.listDirectory()
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>Bittorrent-Fetch</title></head><body><div>${torrentData.map(htmlDir)}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonDir))]}
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
          if(torrentData){
            if(torrentData.infoHash){
              return {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.files.map(file => { return file.urlPath }))]}
            } else {
              if(Array.isArray(torrentData)){
                let checkLength = 0
                torrentData.forEach((data) => {checkLength = checkLength + data.length})
                return {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(checkLength)}, data: mainReq ? [`<html><head><title>Directory</title></head><body><div><h1>Directory</h1><p><a href="../">..</a></p>${torrentData.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.map(file => { return file.urlPath }))]}
              } else {
                if (mainRange) {
                  const ranges = parseRange(torrentData.length, mainRange)
                  if (ranges && ranges.length && ranges.type === 'bytes') {
                    const [{ start, end }] = ranges
                    const length = (end - start + 1)

                    return {statusCode: 206, headers: {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}, data: streamToIterator(torrentData.createReadStream({ start, end }))}
                  } else {
                    return {statusCode: 416, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: ['range is not satisfiable']}
                  }
                } else {
                  return {statusCode: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: streamToIterator(torrentData.createReadStream())}
                }
              }
            }
          } else {
            return {statusCode: 400, headers: mainRes, data: mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>could not find the data</p></div></body></html>`] : [JSON.stringify('could not find the data')]}
          }
        }
      } else if(method === 'POST'){
        if(!body){
          return {statusCode: 400, headers: mainRes, data: mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>must have a body</p></div></body></html>`] : [JSON.stringify('must have a body')]}
        } else {
          const useOpts = {
            count: reqHeaders['x-version'] || searchParams.has('x-version') ? Number(reqHeaders['x-version'] || searchParams.get('x-version')) : null,
            timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0,
            opt: reqHeaders['x-opt'] || searchParams.has('x-opt') ? JSON.parse(reqHeaders['x-opt'] || decodeURIComponent(searchParams.get('x-opt'))) : null
          }
          if (mid.mainQuery) {
            if(JSON.parse(reqHeaders['x-update']) || JSON.parse(searchParams.has('x-update'))){
              const torrentData = await app.publishTorrent({address: null, secret: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]}
            } else {
              const torrentData = await app.publishTorrent({infohash: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Title': torrentData.title}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>infohash: ${torrentData.infohash}</p><p>title: ${torrentData.title}</p></div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]}
            }
          } else {
            if(reqHeaders['x-authentication'] || searchParams.has('x-authentication')){
            const torrentData = await app.publishTorrent({address: mid.mainHost, secret: reqHeaders['x-authentication'] || searchParams.get('x-authentication')}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
            return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Authentication': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div><div>${torrentData.files.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]}
            } else {
              const torrentData = await app.publishTorrent({infohash: mid.mainHost}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Title': torrentData.title}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>infohash: ${torrentData.infohash}</p><p>title: ${torrentData.title}</p></div><div>${torrentData.files.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]}
            }
          }
        }
      } else if(method === 'DELETE'){
        if (mid.mainQuery) {
          return {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>must not use underscore</p></div></body></html>'] : [JSON.stringify('must not use underscore')]}
        } else {
          const torrentData = await app.shredTorrent(mid.mainHost, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || Number(searchParams.get('x-timer'))) : 0})
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainHost}${mid.mainPath}</title></head><body><div><p>${torrentData.type}: ${torrentData.id}</p><p>path: ${torrentData.path}</p><p>link: bt://${torrentData.id}/</p></div></body></html>`] : [JSON.stringify({id: torrentData.id, tid: torrentData.id, type: torrentData.type, path: torrentData.path, link: `bt://${torrentData.id}/`})]}
        }
      } else {
        return { statusCode: 400, headers: { 'Content-Type': mainRes }, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>method is not supported</p></div></body></html>'] : [JSON.stringify('method is not supported')] }
      }
    } catch (e) {
      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
      const useCode = e.name === 'ErrorTimeout' ? 408 : 500
      return { statusCode: useCode, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${e.name}</title></head><body><div><p>${e.stack}</p></div></body></html>`] : [JSON.stringify(e.stack)]}
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