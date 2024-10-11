import { LoggingService } from "./LoggingService";
import { StateService } from "./StateService";

export class IoBrokerStateService implements StateService {
    private adapter: ioBroker.Adapter;
    constructor(
        adapter: ioBroker.Adapter,
        private logger?: LoggingService,
        private checkTime: number = 0,
    ) {
        if (!adapter) {
            throw new Error("adapter may not be null.");
        }
        this.adapter = adapter;
        this.checkTime = Date.now();
    }

    async extendObject(id: string, value: any): Promise<any> {
        if (!id || !value) {
            throw new Error("State or Object is empty! - extendObject");
        }
        await this.adapter.extendObject(id, value);
    }

    setState(id: string, value: string | number | boolean, ack = true): void {
        this.checkId(id);
        this.adapter.setState(id, value, ack);
    }

    async setForeignState(id: string, value: string | number | boolean): Promise<any> {
        const diffTime = Date.now() - this.checkTime;
        this.checkTime = Date.now();
        this.adapter.log.debug(`DIFF: ${diffTime}`);
        if (this.adapter.config.switch_delay > 0 && this.adapter.config.switch_delay > diffTime) {
            this.adapter.log.debug(`Start Sleep`);
            await this.delay(this.adapter.config.switch_delay);
        }
        this.checkId(id);
        this.logger?.logDebug(`Setting state ${id} with value ${value?.toString()}`);
        this.adapter.setForeignState(id, value, false);
    }

    async getForeignState(id: string): Promise<any> {
        return new Promise((resolve, _) => {
            this.checkId(id);
            this.adapter.getForeignState(id, (err, state) => {
                if (err || state == null) {
                    this.adapter.log.error(`Requested state ${id} returned null/undefined!`);
                }
                resolve(state?.val);
            });
        });
    }

    async getState(id: string): Promise<any> {
        return new Promise((resolve, _) => {
            this.checkId(id);
            this.adapter.getForeignState(id, (err, state) => {
                if (err || state == null) {
                    this.adapter.log.error(`Requested getState ${id} returned null/undefined!`);
                }
                resolve(state?.val);
            });
        });
    }

    public delay(ms: number): Promise<void> {
        return new Promise((resolve) => this.adapter.setTimeout(resolve, ms));
    }

    private checkId(id: string): void {
        if (id == null || id.length === 0) {
            throw new Error("id may not be null or empty.");
        }
    }
}
