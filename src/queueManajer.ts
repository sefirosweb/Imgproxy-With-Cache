type typeFinishJobFunc = {
    uuid: number,
    status: string,
    job: any,
    jobPromise: any
}

type typeStartJobFunc = {
    uuid: number,
    job: any,
    jobPromise: any
}

type typeJob = {
    task: () => Promise<unknown>
}

class QueueManager {
    uuid: number
    jobs: typeJob[]
    concurrentJobs: number
    status: string

    executingJobs: any[]
    finishedJobs: any[]
    errorJobs: any[]

    stoppingFunc: (isAlreadyStopped: boolean) => void
    stopedFunc: () => void
    finishedFunc: () => void
    updateFunc: () => void
    startJobFunc: (object: typeStartJobFunc) => void
    finishJobFunc: (object: typeFinishJobFunc) => void

    constructor() {
        this.uuid = 0
        this.jobs = []
        this.concurrentJobs = 8
        this.status = 'stopped'
        this.executingJobs = []
        this.finishedJobs = []
        this.errorJobs = []
    }

    executeJobs(jobs: typeJob[]) {
        if (this.status !== 'stopped') return false;

        this.uuid = 0
        this.status = 'processing'
        this.executingJobs = []
        this.finishedJobs = []
        this.errorJobs = []
        this.jobs = jobs
        this.update();
        for (let i = 0; i < this.concurrentJobs; i++) {
            if (this.jobs.length > 0) {
                this.startQueue()
            }
        }
        return true;
    }

    update() {
        if (this.updateFunc) {
            this.updateFunc()
        }
    }

    startQueue() {
        const job = this.jobs.shift()
        if (job) {
            const uuid = this.uuid
            this.uuid++

            const jobPromise = job.task()
                .then(() => {
                    this.finishedJobs.push(job)
                    if (this.finishJobFunc) {
                        this.finishJobFunc({
                            uuid,
                            status: 'success',
                            job,
                            jobPromise
                        })
                    }
                })
                .catch(() => {
                    this.errorJobs.push(job)
                    this.finishJobFunc({
                        uuid,
                        status: 'error',
                        job,
                        jobPromise
                    })
                })
                .finally(() => {
                    const indexUuid = this.executingJobs.findIndex(j => j.uuid === uuid)
                    this.executingJobs.splice(indexUuid, 1)
                    this.update()
                    if (this.status === 'processing') {
                        this.startQueue()
                        return
                    }
                })

            this.executingJobs.push({
                uuid,
                job,
                jobPromise
            })
            this.update()

            if (this.startJobFunc) {
                this.startJobFunc({
                    uuid,
                    job,
                    jobPromise
                })
            }

        } else {
            if (this.executingJobs.length === 0) {
                this.status = 'stopped'
                this.update();
                if (this.finishedFunc) {
                    this.finishedFunc();
                }
            }
        }
    }



    stop() {
        if (this.status === 'procesing-stop') {
            if (this.stoppingFunc) {
                this.stoppingFunc(false);
            }
            return false;
        }

        this.status = 'procesing-stop'
        this.update()
        if (this.stoppingFunc) {
            this.stoppingFunc(true);
        }

        Promise.allSettled(this.executingJobs.map(p => p.jobPromise))
            .then(() => {
                this.status = 'stopped'
                this.update()
                if (this.stopedFunc) {
                    this.stopedFunc();
                }
            })
    }

    getAllJobs() {
        return this.executingJobs.length + this.finishedJobs.length + this.errorJobs.length + this.jobs.length
    }

    getCurrentFinishedJobs() {
        return this.finishedJobs.length + this.errorJobs.length
    }
}

export {
    QueueManager
}