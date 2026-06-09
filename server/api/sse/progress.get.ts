import { taskEvents } from '../../utils/task'

export default defineEventHandler((event) => {
    const { taskId } = getQuery(event) as { taskId: string }

    if (!taskId) {
        throw createError({ statusCode: 400, message: 'TaskId is required' })
    }

    const { res } = event.node

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })

    const onProgress = (data: any) => {
        if (data.taskId === taskId) {
            res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`)
        }
    }

    const onDone = (data: any) => {
        if (data.taskId === taskId) {
            res.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`)
        }
    }

    const onError = (data: any) => {
        if (data.taskId === taskId) {
            res.write(`event: error\ndata: ${JSON.stringify(data)}\n\n`)
        }
    }

    taskEvents.on('progress', onProgress)
    taskEvents.on('done', onDone)
    taskEvents.on('error', onError)

    // Keep alive
    const kId = setInterval(() => {
        res.write(`: keepalive\n\n`)
    }, 15000)

    event.node.req.on('close', () => {
        taskEvents.off('progress', onProgress)
        taskEvents.off('done', onDone)
        taskEvents.off('error', onError)
        clearInterval(kId)
        res.end()
    })
})
