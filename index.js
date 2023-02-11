module.exports = async function makeBTFetch (opts = {}) {
  const {makeRoutedFetch} = await import('make-fetch')
  const {fetch, router} = makeRoutedFetch()
  const streamToIterator = require('stream-async-iterator')
  const mime = require('mime/lite')
  const parseRange = require('range-parser')
  const Torrentz = require('torrentz')
  const path = require('path')

  const DEFAULT_OPTS = {}
  const finalOpts = { ...DEFAULT_OPTS, ...opts }
  const checkHash = /^[a-fA-F0-9]{40}$/
  const checkAddress = /^[a-fA-F0-9]{64}$/
  const checkTitle = /^[a-zA-Z0-9]{16}$/
  const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE', 'HEAD']
  const hostType = '_'

  const app = await new Promise((resolve) => {if(finalOpts.torrentz){resolve(finalOpts.torrentz)}else{resolve(new Torrentz(finalOpts))}})

  // const prog = new Map()

  function handleTorrent(torrent){
    let test = '<div>'
    for(const i in torrent){
      if(i === 'infohash'){
        test = test + `<p>${i}: ${torrent[i]}</p><p>link: <a href='bt://${torrent[i]}/'>${torrent[i]}</a></p>`
      }
      if(i === 'address'){
        test = test + `<p>${i}: ${torrent[i]}</p><p>link: <a href='bt://${torrent[i]}/'>${torrent[i]}</a></p>`
      }
      if(i === 'secret'){
        test = test + `<p>${i}: ${torrent[i]}</p>`
      }
      if(i === 'title'){
        test = test + `<p>${i}: ${torrent[i]}</p>`
      }
    }
    if(test === '<div>'){
      test = test + `<p>there is no new torrent</p></div>`
    } else {
      test = test + '</div>'
    }
    return test
  }

  function handleFile(id, saved, mid){
    let test = '<div>'
    saved.forEach((data) => {
      test = test + `<p>file: ${data}</p><p>link: <a href='bt://${id}${path.join(mid, data).replace(/\\/g, "/")}'></a></p>`
    })
    if(test === '<div>'){
      test = test + '<p>no files were uploaded</p></div>'
    } else {
      test = test + '</div>'
    }
    return test
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
      } else if(checkTitle.test(mainHost)){
        mainId.title = mainHost
      } else {
        throw new Error('identifier is invalid')
      }
    }
    // if(pathname){
    //     console.log(decodeURIComponent(pathname))
    // }
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
      if(reqHeaders.has('x-data') || searchParams.has('x-data')){
          const torrentData = await app.torrentData(JSON.parse(reqHeaders.get('x-data') || searchParams.get('x-data')))
          return sendTheData(signal, {status: 200, headers: {'X-Length': `${torrentData.length}`}, body: []})
      } else {
        const torrentData = await app.authorData()
        return sendTheData(signal, {status: 200, headers: {'X-Length': `${torrentData.length}`}, body: []})
      }
    } else {
      if (reqHeaders.has('x-copy') || searchParams.has('x-copy')) {
        const torrentData = await app.userTorrent(mid.mainId, mid.mainPath, {id: JSON.parse(reqHeaders.get('x-copy') || searchParams.get('x-copy'))})
        return sendTheData(signal, {status: 200, headers: {'X-Path': torrentData}, body: []})
      } else {
        const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders.has('x-timer') && reqHeaders.get('x-timer') !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) : 0})
        if (torrentData) {
          if(torrentData.infoHash){
            const useHeaders = {}
            // useHeaders['Content-Type'] = mid.mainRes
            useHeaders['Content-Length'] = `${torrentData.length}`
            useHeaders['Accept-Ranges'] = 'bytes'
            useHeaders['X-Downloaded'] = `${torrentData.downloaded}`

            return sendTheData(signal, {status: 200, headers: useHeaders, body: []})
          } else if(Array.isArray(torrentData)){
            let checkLength = 0
            torrentData.forEach((data) => {checkLength = checkLength + data.length})

            sendTheData(signal, {status: 200, headers: {'Content-Length': String(checkLength)}, body: []})
          } else {
            const useHeaders = {}
            useHeaders['Content-Type'] = getMimeType(torrentData.path)
            useHeaders['Content-Length'] = `${torrentData.length}`
            useHeaders['Accept-Ranges'] = 'bytes'
            useHeaders['X-Downloaded'] = `${torrentData.downloaded}`

            return sendTheData(signal, {status: 200, headers: useHeaders, body: []})
          }
        } else {
          return sendTheData(signal, {status: 400, headers: {'Content-Length': '0'}, body: []})
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
      if(reqHeaders.has('x-data') || searchParams.has('x-data')){
          const torrentData = await app.torrentData(JSON.parse(reqHeaders.get('x-data') || searchParams.get('x-data')))
          return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.length ? torrentData.map(htmlIden) : '<p>there are no data</p>'}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonIden))]})
      } else {
        const torrentData = await app.authorData()
        return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.length ? torrentData.map((data) => {if(data.address){data.link = `<a href='bt://${data.address}/'>${data.address}</a>`} else if(data.title){data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`} return `<p>${JSON.stringify(data)}</p>`;}) : '<p>there are no data</p>'}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {if(data.address){data.link = `bt://${data.address}/`} else if(data.title){data.link = `bt://${data.infohash}/`} return data;}))]})
      }
    } else {
      const mainRange = reqHeaders.has('Range') || reqHeaders.has('range')
      const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders.has('x-timer') && reqHeaders.get('x-timer') !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) : 0})
      if(torrentData){
        if(torrentData.infoHash){
          return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.files.map(file => { return file.urlPath }))]})
        } else {
          if(Array.isArray(torrentData)){
            let checkLength = 0
            torrentData.forEach((data) => {checkLength = checkLength + data.length})
            return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(checkLength)}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><h1>Directory</h1><p><a href='../'>..</a></p>${torrentData.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.map(file => { return file.urlPath }))]})
          } else {
            if (mainRange) {
              const ranges = parseRange(torrentData.length, mainRange)
              if (ranges && ranges.length && ranges.type === 'bytes') {
                const [{ start, end }] = ranges
                const length = (end - start + 1)

                return sendTheData(signal, {status: 206, headers: {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}, body: streamToIterator(torrentData.createReadStream({ start, end }))})
              } else {
                return sendTheData(signal, {status: 416, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, body: ['range is not satisfiable']})
              }
            } else {
              return sendTheData(signal, {status: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, body: streamToIterator(torrentData.createReadStream())})
            }
          }
        }
      } else {
        return sendTheData(signal, {status: 400, headers: {'Content-Type': mainRes}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>could not find the data</p></div></body></html>`] : [JSON.stringify('could not find the data')]})
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
        const useOpts = {
          count: reqHeaders.has('x-version') || searchParams.has('x-version') ? Number(reqHeaders.get('x-version') || searchParams.get('x-version')) : null,
          timeout: (reqHeaders.has('x-timer') && reqHeaders.get('x-timer') !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) : 0,
          opt: reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : null
        }
        const formData = { form: reqHeaders.has('content-type') && reqHeaders.get('content-type').includes('multipart/form-data') }
        formData.data = formData.form ? await request.formData() : body
        if((reqHeaders.has('x-update') && JSON.parse(reqHeaders.get('x-update'))) || (searchParams.has('x-update') && JSON.parse(searchParams.get('x-update')))){
          const torrentData = await app.publishTorrent({address: null, secret: null}, mid.mainPath, formData, useOpts)
          return sendTheData(signal, {status: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Id': torrentData.id, 'X-Sequence': torrentData.sequence, 'X-Title': torrentData.title, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map((data) => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map((data) => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))]})
        } else {
          const torrentData = await app.publishTorrent({infohash: null}, mid.mainPath, formData, useOpts)
          return sendTheData(signal, {status: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Id': torrentData.id}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))]})
        }
    } else {
        const useOpts = {
          count: reqHeaders.has('x-version') || searchParams.has('x-version') ? Number(reqHeaders.get('x-version') || searchParams.get('x-version')) : null,
          timeout: (reqHeaders.has('x-timer') && reqHeaders.get('x-timer') !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders.get('x-timer') || searchParams.get('x-timer')) : 0,
          opt: reqHeaders.has('x-opt') || searchParams.has('x-opt') ? JSON.parse(reqHeaders.get('x-opt') || decodeURIComponent(searchParams.get('x-opt'))) : null
        }
        const formData = { form: reqHeaders.has('content-type') && reqHeaders.get('content-type').includes('multipart/form-data') }
        formData.data = formData.form ? await request.formData() : body
        if(reqHeaders.has('x-authentication') || searchParams.has('x-authentication')){
          const torrentData = await app.publishTorrent(mid.mainId, mid.mainPath, formData, useOpts)
          return sendTheData(signal, {status: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Id': torrentData.id, 'X-Sequence': torrentData.sequence, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Title': torrentData.title, 'X-Infohash': torrentData.infohash}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))]})
        } else {
          const torrentData = await app.publishTorrent(mid.mainId, mid.mainPath, formData, useOpts)
          return sendTheData(signal, {status: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Id': torrentData.id}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return path.join('bt://', mid.mainPath, data).replace(/\\/g, "/")}))]})
        }
    }
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
      return sendTheData(signal, { status: 400, headers: { 'Content-Type': mainRes }, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>must not use underscore</p></div></body></html>`] : [JSON.stringify('must not use underscore')] })
    } else {
      const torrentData = await app.shredTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders.has('x-timer') && reqHeaders.get('x-timer') !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders.get('x-timer') || Number(searchParams.get('x-timer'))) : 0})
      const useHead = {}
      if(torrentData.torrent.address){
        useHead['X-Address'] = torrentData.torrent.address
      }
      if(torrentData.torrent.secret){
        useHead['X-Secret'] = torrentData.torrent.secret
      }
      if(torrentData.torrent.title){
        useHead['X-Title'] = torrentData.torrent.title
      }
      if(torrentData.torrent.infohash){
        useHead['X-Infohash'] = torrentData.torrent.infohash
      }
      const useData = useHead['X-Address'] || useHead['X-Infohash'] || torrentData.id

      return sendTheData(signal, {status: 200, headers: {'Content-Type': mainRes, 'X-Id': torrentData.id, ...useHead}, body: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify({tid: torrentData.id, path: torrentData.path, link: `bt://${useData}/`})}</div></body></html>`] : [JSON.stringify({tid: torrentData.id, path: torrentData.path, link: `bt://${useData}/`})]})
    }
  }
  
  router.head('bt://*/**', handleHead)
  router.get('bt://*/**', handleGet)
  router.post('bt://*/**', handlePost)
  router.delete('bt://*/**', handleDelete)

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