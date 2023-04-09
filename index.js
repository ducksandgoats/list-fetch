module.exports = async function makeBTFetch (opts = {}) {
  const {makeRoutedFetch} = await import('make-fetch')
  const fs = require('fs')
  const {fetch, router} = makeRoutedFetch({onNotFound: handleEmpty, onError: handleError})
  // const streamToIterator = require('stream-async-iterator')
  const mime = require('mime/lite')
  const parseRange = require('range-parser')
  const Torrentz = require('torrentz')
  const path = require('path')

  const DEFAULT_OPTS = {}
  const finalOpts = { ...DEFAULT_OPTS, ...opts }
  const checkHash = /^[a-fA-F0-9]{40}$/
  const checkAddress = /^[a-fA-F0-9]{64}$/
  // const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE', 'HEAD']
  const hostType = '_'
  const btTimeout = 30000

  const app = await new Promise((resolve) => {if(finalOpts.torrentz){resolve(finalOpts.torrentz)}else{resolve(new Torrentz(finalOpts))}})

  // const prog = new Map()

  function handleEmpty(request) {
    const { url, headers: reqHeaders, method, body, signal } = request
    if(signal){
      signal.removeEventListener('abort', takeCareOfIt)
    }
    const mainReq = !reqHeaders.has('accept') || !reqHeaders.get('accept').includes('application/json')
    const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
    return {status: 400, headers: { 'Content-Type': mainRes }, body: mainReq ? `<html><head><title>${url}</title></head><body><div><p>did not find any data</p></div></body></html>` : JSON.stringify('did not find any data')}
  }

  function handleError(e, request) {
    const { url, headers: reqHeaders, method, body, signal } = request
    if(signal){
      signal.removeEventListener('abort', takeCareOfIt)
    }
    const mainReq = !reqHeaders.has('accept') || !reqHeaders.get('accept').includes('application/json')
    const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
    return {status: 500, headers: { 'X-Error': e.name, 'Content-Type': mainRes }, body: mainReq ? `<html><head><title>${e.name}</title></head><body><div><p>${e.stack}</p></div></body></html>` : JSON.stringify(e.stack)}
  }

  function handleFormData(formdata) {
    const arr = []
    for (const [name, info] of formdata) {
      if (name === 'file') {
        arr.push(info)
      }
    }
    return arr
  }

  function takeCareOfIt(data){
    console.log(data)
    throw new Error('aborted')
  }

  function sendTheData(theSignal, theData){
    if(theSignal){
      theSignal.removeEventListener('abort', takeCareOfIt)
    }
    return theData
  }

  function htmlIden(data){
    if(data.address){
      data.link = `<a href='bt://${data.address}/'>${data.address}</a>`
    } else if(data.infohash){
      data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`
    }
    return `<p>${JSON.stringify(data)}</p>`
  }

  function jsonIden(data){
    if(data.address){
      data.link = `bt://${data.address}/`
    } else if(data.infohash){
      data.link = `bt://${data.infohash}/`
    }
    return data
  }

  function getMimeType (path) {
    let mimeType = mime.getType(path) || 'text/plain'
    if (mimeType.startsWith('text/')) mimeType = `${mimeType}; charset=utf-8`
    return mimeType
  }

  function formatReq (hostname, pathname, extra) {

    // let mainType = hostname[0] === hostType || hostname[0] === sideType ? hostname[0] : ''
    const mainQuery = hostname === hostType ? true : false
    const mainHost = hostname
    const mainId = {}
    if(!mainQuery){
      if(checkAddress.test(mainHost)){
        mainId.address = mainHost
        mainId.secret = extra
      } else if(checkHash.test(mainHost)){
        mainId.infohash = mainHost
      } else {
        throw new Error('identifier is invalid')
      }
    }
    
    const mainPath = decodeURIComponent(pathname)
    const mainLink = `bt://${mainHost}${mainPath.includes('.') ? mainPath : mainPath + '/'}`
    return { mainQuery, mainHost, mainPath, mainId, mainLink }
  }

  async function handleHead(request) {
    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    const { hostname, pathname, protocol, search, searchParams } = new URL(url)

    const mid = formatReq(decodeURIComponent(hostname), decodeURIComponent(pathname), reqHeaders.get('x-authentication'))

    // const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
    // const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
    if (mid.mainQuery) {
      if(mid.mainPath === '/'){
        if(reqHeaders.has('x-data') || searchParams.has('x-data')){
          const torrentData = await app.torrentData(JSON.parse(reqHeaders.get('x-data') || searchParams.get('x-data')))
          const useHeaders = {}
          const useCount = torrentData.length
          let useLength = 0
          for(const test of torrentData){
            if(test.length){
              useLength = useLength + test.length
            }
          }
          useHeaders['X-Count'] = useCount
          if(useLength){
            useHeaders['X-Length'] = useLength
          }
          return sendTheData(signal, {status: 200, headers: useHeaders, body: ''})
        } else {
          const torrentData = await app.authorData()
          const useHeaders = {}
          const useCount = torrentData.length
          let useLength = 0
          for(const test of torrentData){
            useLength = useLength + test.length
          }
          useHeaders['X-Count'] = useCount
          useHeaders['X-Length'] = useLength
          return sendTheData(signal, {status: 200, headers: useHeaders, body: ''})
        }
      } else {
        return sendTheData(signal, {status: 400, headers: {'X-Status': 'can not have a path'}, body: ''})
      }
    } else {
      const useOpt = reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : {}
      const useOpts = { ...useOpt, timeout: reqHeaders.has('x-timer') || searchParams.has('x-timer') ? reqHeaders.get('x-timer') !== '0' || searchParams.get('x-timer') !== '0' ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) * 1000 : undefined : btTimeout }
      if (reqHeaders.has('x-copy') || searchParams.has('x-copy')) {
        const torrentData = await app.userTorrent(mid.mainId, mid.mainPath, { ...useOpts, id: JSON.parse(reqHeaders.get('x-copy') || searchParams.get('x-copy')) })
        return sendTheData(signal, { status: 200, headers: { 'X-Path': torrentData }, body: '' })
      } else {
        const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, useOpts)
        if (torrentData) {
          if (Array.isArray(torrentData)) {
            const useHeaders = { 'Content-Length': 0, 'X-Downloaded': 0, 'X-Link': `bt://${mid.mainHost}${mid.mainPath}` }
            useHeaders['Link'] = `<${useHeaders['X-Link']}>; rel="canonical"`
            torrentData.forEach((data) => {
              useHeaders['Content-Length'] = useHeaders['Content-Length'] + data.length
              useHeaders['X-Downloaded'] = useHeaders['X-Downloaded'] + data.downloaded
            })
            
            return sendTheData(signal, { status: 200, headers: useHeaders, body: '' })
          } else if(torrentData.createReadStream){
            const useHeaders = {}
            useHeaders['Content-Type'] = getMimeType(torrentData.path)
            useHeaders['Content-Length'] = `${torrentData.length}`
            useHeaders['Accept-Ranges'] = 'bytes'
            useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
            useHeaders['X-Link'] = `bt://${mid.mainHost}${mid.mainPath}`
            useHeaders['Link'] = `<bt://${useHeaders['X-Link']}>; rel="canonical"`

            return sendTheData(signal, {status: 200, headers: useHeaders, body: ''})
          } else {
            return sendTheData(signal, { status: 400, headers: { 'X-Error': 'did not find any data' }, body: '' })
          }
        } else {
          return sendTheData(signal, {status: 400, headers: {'X-Error': 'did not find any data'}, body: ''})
        }
      }
    }
  }
  
  async function handleGet(request) {
    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    const { hostname, pathname, protocol, search, searchParams } = new URL(url)

    const mid = formatReq(decodeURIComponent(hostname), decodeURIComponent(pathname), reqHeaders.get('x-authentication'))

    const mainReq = !reqHeaders.has('accept') || !reqHeaders.get('accept').includes('application/json')
    const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

    if (mid.mainQuery) {
      if(mid.mainPath === '/'){
        if(reqHeaders.has('x-data') || searchParams.has('x-data')){
          const torrentData = await app.torrentData(JSON.parse(reqHeaders.get('x-data') || searchParams.get('x-data')))
          return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes}, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map(htmlIden)}</div></body></html>` : JSON.stringify(torrentData.map(jsonIden))})
        } else {
          const torrentData = await app.authorData()
          return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes}, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map(htmlIden)}</div></body></html>` : JSON.stringify(torrentData.map(jsonIden))})
        }
      } else {
        return sendTheData(signal, { status: 400, headers: mainRes, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><p>can not have a path</p></div></body></html>` : JSON.stringify('can not have a path') })
      }
    } else {
      const useOpt = reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : {}
      const useOpts = { ...useOpt, timeout: reqHeaders.has('x-timer') || searchParams.has('x-timer') ? reqHeaders.get('x-timer') !== '0' || searchParams.get('x-timer') !== '0' ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) * 1000 : undefined : btTimeout }
      const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, useOpts)
      if(torrentData){
        if (Array.isArray(torrentData)) {
          const useHeaders = { 'Content-Length': 0, 'Accept-Ranges': 'bytes', 'X-Downloaded': 0, 'X-Link': `bt://${mid.mainHost}${mid.mainPath}` }
          useHeaders['Link'] = `<${useHeaders['X-Link']}>; rel="canonical"`
          torrentData.forEach((data) => {
            useHeaders['Content-Length'] = useHeaders['Content-Length'] + data.length
            useHeaders['X-Downloaded'] = useHeaders['X-Downloaded'] + data.downloaded
          })
          useHeaders['Content-Type'] = mainRes
          useHeaders['Content-Length'] = String(useHeaders['Content-Length'])
          useHeaders['X-Downloaded'] = String(useHeaders['X-Downloaded'])
          return sendTheData(signal, {status: 200, headers: useHeaders, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><h1>Directory</h1><p><a href='../'>..</a></p>${torrentData.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>` : JSON.stringify(torrentData.map(file => { return file.urlPath }))})
        } else if(torrentData.createReadStream){
          const mainRange = reqHeaders.has('Range') || reqHeaders.has('range')
          if (mainRange) {
            const ranges = parseRange(torrentData.length, reqHeaders.get('Range') || reqHeaders.get('range'))
            if (ranges && ranges.length && ranges.type === 'bytes') {
              const [{ start, end }] = ranges
              const length = (end - start + 1)

              return sendTheData(signal, {status: 206, headers: {'X-Link': `bt://${mid.mainHost}${mid.mainPath}`, 'Link': `<bt://${mid.mainHost}${mid.mainPath}>; rel="canonical"`, 'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}, body: torrentData.createReadStream({ start, end })})
            } else {
              return sendTheData(signal, {status: 416, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, body: mainReq ? '<html><head><title>range</title></head><body><div><p>malformed or unsatisfiable range</p></div></body></html>' : JSON.stringify('malformed or unsatisfiable range')})
            }
          } else {
            return sendTheData(signal, {status: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'X-Link': `bt://${mid.mainHost}${mid.mainPath}`, 'Link': `<bt://${mid.mainHost}${mid.mainPath}>; rel="canonical"`, 'Content-Length': String(torrentData.length)}, body: torrentData.createReadStream()})
          }
        } else {
          return sendTheData(signal, { status: 400, headers: { 'Content-Type': mainRes }, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><p>could not find the data</p></div></body></html>` : JSON.stringify('could not find the data') })
        }
      } else {
        return sendTheData(signal, {status: 400, headers: {'Content-Type': mainRes}, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><p>could not find the data</p></div></body></html>` : JSON.stringify('could not find the data')})
      }
    }
  }
  
  async function handlePost(request) {
    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    const { hostname, pathname, protocol, search, searchParams } = new URL(url)

    const mid = formatReq(decodeURIComponent(hostname), decodeURIComponent(pathname), reqHeaders.get('x-authentication'))

    const mainReq = !reqHeaders.has('accept') || !reqHeaders.get('accept').includes('application/json')
    const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

    if (mid.mainQuery) {
      if (reqHeaders.has('x-update') || searchParams.has('x-update')) {
        if (JSON.parse(reqHeaders.get('x-update') || searchParams.get('x-update'))) {
          mid.mainId = { address: null, secret: null }
        } else {
          mid.mainId = { infohash: null }
        }
      } else {
        return sendTheData(signal, { status: 400, headers: mainRes, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><p>invalid data</p></div></body></html>` : JSON.stringify('invalid data') })
      }
    }

      const useOpt = reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : {}
      const useOpts = {
          ...useOpt,
          seq: reqHeaders.has('x-version') || searchParams.has('x-version') ? Number(reqHeaders.get('x-version') || searchParams.get('x-version')) : null,
        }
      const useBody = reqHeaders.has('content-type') && reqHeaders.get('content-type').includes('multipart/form-data') ? handleFormData(await request.formData()) : body
      const torrentData = await app.publishTorrent(mid.mainId, mid.mainPath, useBody, useOpts)
      const useHeaders = {}
      for (const test of ['sequence', 'name', 'infohash', 'dir', 'pair', 'secret', 'address']) {
        if (torrentData[test] || typeof(torrentData[test]) === 'number') {
          useHeaders['X-' + test.charAt(0).toUpperCase() + test.slice(1)] = torrentData[test]
        }
      }
      const useIden = torrentData.address || torrentData.infohash
      torrentData.saved = 'bt://' + path.join(useIden, torrentData.saved).replace(/\\/g, '/')
      useHeaders['X-Link'] = `bt://${useIden}${torrentData.path}`
      useHeaders['Link'] = `<${useHeaders['X-Link']}>; rel="canonical"`
      return sendTheData(signal, { status: 200, headers: { 'Content-Length': String(torrentData.length), 'Content-Type': mainRes, ...useHeaders }, body: mainReq ? `<html><head><title>${useIden}</title></head><body><div>${JSON.stringify(torrentData.saved)}</div></body></html>` : JSON.stringify(torrentData.saved) })
  }
  
  async function handleDelete(request) {
    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    const { hostname, pathname, protocol, search, searchParams } = new URL(url)

    const mid = formatReq(decodeURIComponent(hostname), decodeURIComponent(pathname), reqHeaders.get('x-authentication'))

    const mainReq = !reqHeaders.has('accept') || !reqHeaders.get('accept').includes('application/json')
    const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

    if (mid.mainQuery) {
      return sendTheData(signal, { status: 400, headers: mainRes, body: mainReq ? `<html><head><title>${mid.mainLink}</title></head><body><div><p>invalid query</p></div></body></html>` : JSON.stringify('invalid query') })
    }
      const useOpt = reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : {}
      const useOpts = {
          ...useOpt,
          count: reqHeaders.has('x-version') || searchParams.has('x-version') ? Number(reqHeaders.get('x-version') || searchParams.get('x-version')) : null
      }
      const torrentData = await app.shredTorrent(mid.mainId, mid.mainPath, useOpts)
      const useHead = {}
      for (const test of ['id', 'path', 'infohash', 'dir', 'name', 'sequence', 'pair', 'address', 'secret']) {
        if (torrentData[test]) {
          useHead['X-' + test.charAt(0).toUpperCase() + test.slice(1)] = torrentData[test]
        }
      }
      const useIden = torrentData.address || torrentData.infohash || torrentData.id
      const useLink = `bt://${torrentData.id}${torrentData.path}`
      useHead['X-Link'] = `bt://${useIden}${torrentData.path}`
      useHead['Link'] = `<${useHead['X-Link']}>; rel="canonical"`

      return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes, ...useHead}, body: mainReq ? `<html><head><title>${useIden}</title></head><body><div>${useLink}</div></body></html>` : JSON.stringify(useLink)})
  }
  
  router.head('bt://*/**', handleHead)
  router.get('bt://*/**', handleGet)
  router.post('bt://*/**', handlePost)
  router.delete('bt://*/**', handleDelete)

  fetch.close = async () => {
    for (const data of app.webtorrent.torrents) {
      await new Promise((resolve, reject) => {
        data.destroy({ destroyStore: false }, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
    app.checkId.clear()
    clearInterval(app.session)
    return await new Promise((resolve, reject) => {
      app.webtorrent.destroy(error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  return fetch
}