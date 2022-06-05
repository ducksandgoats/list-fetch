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
  const hostType = '_'

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
    const mainPath = pathname
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
          const torrentData = await app.loadTorrent(mid.mainHost)
          if (mid.mainPath === '/') {
            const useHeaders = {}
            useHeaders['Content-Type'] = mid.mainRes
            useHeaders['Content-Length'] = `${torrentData.length}`
            useHeaders['Accept-Ranges'] = 'bytes'
            useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
            return {statusCode: 200, headers: useHeaders, data: []}
          } else {
            const foundFile = torrentData.files.find(file => { return mid.mainPath === file.urlPath })
            if (foundFile) {
              const useHeaders = {}
              useHeaders['Content-Type'] = getMimeType(mid.mainPath)
              useHeaders['Content-Length'] = `${foundFile.length}`
              useHeaders['Accept-Ranges'] = 'bytes'
              useHeaders['X-Downloaded'] = `${foundFile.downloaded}`
              return {statusCode: 200, headers: useHeaders, data: []}
            } else {
              return {statusCode: 400, headers: {'Content-Length': '0'}, data: []}
            }
          }
        }
      } else if(method === 'GET'){
        const mainRange = reqHeaders.Range || reqHeaders.range
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        if (mid.mainQuery) {
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>Thank you for using Bittorrent-Fetch-Fetch</p></div></body></html>'] : [JSON.stringify('Thank you for using BT-Fetch')]}
        } else {
          const torrentData = await app.loadTorrent(mid.mainHost, reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) * 1000 : 0)
          let foundFile = null
          if (mid.mainPath === '/') {
            return {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href="${file.urlPath}">${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify({infohash: torrentData.infohash, files: torrentData.files.map(file => { return `${file.urlPath}` })})]}
          } else {
            foundFile = torrentData.files.find(file => { return mid.mainPath === file.urlPath })
            if (foundFile) {
              if (mainRange) {
                const ranges = parseRange(foundFile.length, mainRange)
                if (ranges && ranges.length && ranges.type === 'bytes') {
                  const [{ start, end }] = ranges
                  const length = (end - start + 1)

                  return {statusCode: 206, headers: {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${foundFile.length}`, 'Content-Type': getMimeType(mid.mainPath)}, data: streamToIterator(foundFile.createReadStream({ start, end }))}
                } else {
                  return {statusCode: 200, headers: {'Content-Type': getMimeType(mid.mainPath), 'Content-Length': String(foundFile.length)}, data: streamToIterator(foundFile.createReadStream())}
                }
              } else {
                return {statusCode: 200, headers: {'Content-Type': getMimeType(mid.mainPath), 'Content-Length': String(foundFile.length)}, data: streamToIterator(foundFile.createReadStream())}
              }
            } else {
              return {statusCode: 400, headers: mainRes, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>could not find the file</p></div></body></html>`] : [JSON.stringify('could not find the file')]}
            }
          }
        }
      } else if(method === 'PUT'){
        const mainReq = reqHeaders.accept && reqHeaders.accept.includes('text/html')
        const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
        const count = reqHeaders['x-version'] && !isNaN(reqHeaders['x-version']) ? Number(reqHeaders['x-version']) : null
        if (mid.mainQuery) {
          if ((!reqHeaders['content-type'] || !reqHeaders['content-type'].includes('multipart/form-data')) || ((reqHeaders['x-empty']) && (reqHeaders['x-empty'] !== 'false' && reqHeaders['x-empty'] !== 'true')) || !body) {
            return {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>must have X-Update header which must be set to true or false, must have Content-Type header set to multipart/form-data, must have body, also must have X-Title header for non-BEP46 torrents</p></div></body></html>'] : [JSON.stringify('must have X-Update header which must be set to true or false, must have Content-Type header set to multipart/form-data, must have body, also must have X-Title header for non-BEP46 torrents')]}
          } else {
            const torrentData = await app.publishTorrent(true, null, count, reqHeaders, body, reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) * 1000 : 0, reqHeaders['x-empty'] ? JSON.parse(reqHeaders['x-empty']) : null)
            return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify({ address: torrentData.address, infohash: torrentData.infohash, sequence: torrentData.sequence, secret: torrentData.secret })]}
          }
        } else {
          if((!reqHeaders['content-type'] || !reqHeaders['content-type'].includes('multipart/form-data')) || ((reqHeaders['x-empty']) && (reqHeaders['x-empty'] !== 'false' && reqHeaders['x-empty'] !== 'true')) || !body){
            return {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? ['<html><head><title>Bittorrent-Fetch</title></head><body><div><p>must have X-Update header which must be set to true or false, must have Content-Type header set to multipart/form-data, must have body, also must have X-Authentication header for BEP46 torrents</p></div></body></html>'] : [JSON.stringify('must have X-Update header which must be set to true or false, must have Content-Type header set to multipart/form-data, must have body')]}
          } else {
            if(reqHeaders['x-authentication']){
              const torrentData = await app.publishTorrent(true, {address: mid.mainHost, secret: reqHeaders['x-authentication']}, count, reqHeaders, body, reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) * 1000 : 0, reqHeaders['x-empty'] ? JSON.parse(reqHeaders['x-empty']) : null)
              return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${torrentData.name}</title></head><body><div><p>address: ${torrentData.address}</p><p>infohash: ${torrentData.infohash}</p><p>sequence: ${torrentData.sequence}</p><p>secret: ${torrentData.secret}</p></div></body></html>`] : [JSON.stringify({ address: torrentData.address, infohash: torrentData.infohash, sequence: torrentData.sequence, secret: torrentData.secret })]}
            } else {
              const torrentData = await app.publishTorrent(false, mid.mainHost, count, reqHeaders, body, reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0' ? Number(reqHeaders['x-timer']) * 1000 : 0, reqHeaders['x-empty'] ? JSON.parse(reqHeaders['x-empty']) : null)
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
          const torrentData = await app.shredTorrent(mid.mainHost)
          return {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>Bittorrent-Fetch</title></head><body><div><p>${torrentData} was shredded</p></div></body></html>`] : [JSON.stringify(`${torrentData} was shredded`)]}
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