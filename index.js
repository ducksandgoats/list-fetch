const makeFetch = require('make-fetch')
const streamToIterator = require('stream-async-iterator')
const mime = require('mime/lite')
const parseRange = require('range-parser')
const Torrentz = require('torrentz')

module.exports = async function makeBTFetch (opts = {}) {
  const DEFAULT_OPTS = {}
  const finalOpts = { ...DEFAULT_OPTS, ...opts }
  const checkHash = /^[a-fA-F0-9]{40}$/
  const checkAddress = /^[a-fA-F0-9]{64}$/
  const checkTitle = /^[a-zA-Z0-9]/
  const SUPPORTED_METHODS = ['GET', 'PUT', 'DELETE', 'HEAD']
  const encodeType = 'hex'
  const hostType = '~'

  const app = await new Promise((resolve) => {if(finalOpts.torrentz){resolve(finalOpts.torrentz)}else{resolve(new Torrentz(finalOpts))}})

  // const prog = new Map()

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
      const { hostname, pathname, protocol, searchParams } = new URL(url)
      const mainHostname = hostname && hostname.startsWith(encodeType) ? Buffer.from(hostname.slice(encodeType.length), 'hex').toString('utf-8') : hostname

      if (protocol !== 'bt:') {
        return { statusCode: 409, headers: {}, data: ['wrong protocol'] }
      } else if (!method || !SUPPORTED_METHODS.includes(method)) {
        return { statusCode: 409, headers: {}, data: ['something wrong with method'] }
      } else if ((!mainHostname) || (mainHostname.length === 1 && mainHostname !== hostType) || (mainHostname.length !== 1 && !checkTitle.test(mainHostname) && !checkHash.test(mainHostname) && !checkAddress.test(mainHostname))) {
        return { statusCode: 409, headers: {}, data: ['something wrong with hostname'] }
      }

      const mid = formatReq(decodeURIComponent(mainHostname), decodeURIComponent(pathname))

      if(method === 'HEAD'){
        if (mid.mainQuery) {
          return { statusCode: 400, headers: {'Content-Length': '0'}, data: [] }
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) : 0})
          if (torrentData) {
            if(torrentData.infoHash){
              const useHeaders = {}
              // useHeaders['Content-Type'] = mid.mainRes
              useHeaders['Content-Length'] = `${torrentData.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
              return {statusCode: 200, headers: useHeaders, data: []}
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
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        if (mid.mainQuery) {
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>Thank you for using Bittorrent-Fetch-Fetch</p></div></body></html>'] : [JSON.stringify('Thank you for using BT-Fetch')]}
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, mid.mainPath, {timeout: reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) : 0})
          if(torrentData){
            if(torrentData.infoHash){
              return {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify({infohash: torrentData.infohash, files: torrentData.files.map(file => { return `${file.urlPath}` })})]}
            } else {
              if (mainRange) {
                const ranges = parseRange(torrentData.length, mainRange)
                if (ranges && ranges.length && ranges.type === 'bytes') {
                  const [{ start, end }] = ranges
                  const length = (end - start + 1)

                  return {statusCode: 206, headers: {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}, data: streamToIterator(torrentData.createReadStream({ start, end }))}
                } else {
                  return {statusCode: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: streamToIterator(torrentData.createReadStream())}
                }
              } else {
                return {statusCode: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: streamToIterator(torrentData.createReadStream())}
              }
            }
          } else {
            return {statusCode: 400, headers: mainRes, data: mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>could not find the file</p></div></body></html>`] : [JSON.stringify('could not find the file')]}
          }
        }
      } else if(method === 'PUT'){
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        if(!body){
          return {statusCode: 400, headers: mainRes, data: mainReq ? [`<html><head><title>${mid.mainHost}</title></head><body><div><p>must have a body</p></div></body></html>`] : [JSON.stringify('must have a body')]}
        } else {
          const useOpts = {
            count: reqHeaders['x-version'] ? Number(reqHeaders['x-version']) : null,
            timeout: reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) : 0,
            opt: reqHeaders['x-opt'] ? JSON.parse(reqHeaders['x-opt']) : null

          }
          if (mid.mainQuery) {
            const torrentData = await app.publishTorrent({address: null, secret: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
            return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify({ address: torrentData.address, infohash: torrentData.infohash, sequence: torrentData.sequence, secret: torrentData.secret })]}
          } else {
            if(reqHeaders['x-authentication']){
            const torrentData = await app.publishTorrent({address: mid.mainHost, secret: reqHeaders['x-authentication']}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
            return {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify({ address: torrentData.address, infohash: torrentData.infohash, sequence: torrentData.sequence, secret: torrentData.secret })]}
            } else {
              const torrentData = await app.publishTorrent({title: mid.mainHost}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>infohash: ${torrentData.infohash}</p><p>title: ${torrentData.title}</p></div></body></html>`] : [JSON.stringify({ infohash: torrentData.infohash, title: torrentData.title })]}
            }
          }
        }
      } else if(method === 'DELETE'){
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        if (mid.mainQuery) {
          return {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>must not use underscore</p></div></body></html>'] : [JSON.stringify('must not use udnerscore')]}
        } else {
          const torrentData = await app.shredTorrent(mid.mainHost, mid.mainPath, {timeout: reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) : 0})
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainHost}${mid.mainPath}</title></head><body><div><p>${torrentData}</p></div></body></html>`] : [JSON.stringify(torrentData)]}
        }
      } else {
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        return { statusCode: 400, headers: { 'Content-Type': mainRes }, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>method is not supported</p></div></body></html>'] : [JSON.stringify('method is not supported')] }
      }
    } catch (e) {
      const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
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