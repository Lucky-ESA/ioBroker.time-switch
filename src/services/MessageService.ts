import { OnOffStateAction } from "../actions/OnOffStateAction";
import { TimeSwitch } from "../main";
import { OnOffSchedule } from "../schedules/OnOffSchedule";
import { Schedule } from "../schedules/Schedule";
import { OnOffScheduleSerializer } from "../serialization/OnOffScheduleSerializer";
import { AstroTime } from "../triggers/AstroTime";
import { AstroTriggerBuilder } from "../triggers/AstroTriggerBuilder";
import { DailyTriggerBuilder } from "../triggers/DailyTriggerBuilder";
import { TimeTriggerBuilder } from "../triggers/TimeTriggerBuilder";
import { Trigger } from "../triggers/Trigger";
import { AllWeekdays } from "../triggers/Weekday";
import { LoggingService } from "./LoggingService";
import { StateService } from "./StateService";

export class MessageService {
    private currentMessage: ioBroker.Message | null = null;
    private triggerTimeout: any;

    constructor(
        private stateService: StateService,
        private logger: LoggingService,
        private scheduleIdToSchedule: Map<string, Schedule>,
        private createOnOffScheduleSerializer: (dataId: string) => Promise<OnOffScheduleSerializer>,
        private adapter: ioBroker.Adapter,
    ) {
        this.adapter = adapter;
        this.triggerTimeout = undefined;
    }

    public async handleMessage(message: ioBroker.Message): Promise<void> {
        if (this.currentMessage) {
            this.triggerTimeout = this.adapter.setTimeout(() => {
                this.handleMessage(message);
                this.triggerTimeout = undefined;
            }, 50);
            return;
        }
        this.currentMessage = message;
        const data: any = message.message;
        if (message.command === "change-view-dataId") {
            await this.updateViews(data);
            this.logger.logDebug("Finished message " + message.command);
            this.currentMessage = null;
            return;
        }
        this.logger.logDebug(`Received ${message.command}`);
        this.logger.logDebug(JSON.stringify(message.message));
        const schedule = this.scheduleIdToSchedule.get(data.dataId);
        if (!schedule) {
            throw new Error("No schedule found for state " + data.dataId);
        }
        switch (message.command) {
            case "add-trigger":
                await this.addTrigger(schedule, data);
                break;
            case "add-one-time-trigger":
                await this.addOneTimeTrigger(schedule, data);
                break;
            case "update-trigger":
                await this.updateTrigger(schedule, JSON.stringify(data.trigger), data.dataId);
                break;
            case "delete-trigger":
                schedule.removeTrigger(data.triggerId);
                break;
            case "change-name":
                schedule.setName(data.name);
                this.changeName(data);
                break;
            case "enable-schedule":
                schedule.setEnabled(true);
                await this.stateService.setState(TimeSwitch.getEnabledIdFromScheduleId(data.dataId), true);
                break;
            case "disable-schedule":
                schedule.setEnabled(false);
                await this.stateService.setState(TimeSwitch.getEnabledIdFromScheduleId(data.dataId), false);
                break;
            case "change-switched-values":
                this.changeOnOffSchedulesSwitchedValues(schedule, data);
                break;
            case "change-switched-ids":
                this.changeOnOffSchedulesSwitchedIds(schedule, data.stateIds);
                break;
            default:
                throw new Error("Unknown command received");
        }
        if (schedule instanceof OnOffSchedule) {
            await this.stateService.setState(
                data.dataId,
                (await this.createOnOffScheduleSerializer(data.dataId)).serialize(schedule),
            );
        } else {
            throw new Error("Cannot update schedule state after message, no serializer found for schedule");
        }
        this.logger.logDebug("Finished message " + message.command);
        this.currentMessage = null;
    }

    private async changeName(data: any): Promise<void> {
        const state = data?.dataId.split(".");
        await this.stateService.extendObject(`onoff.${state[3]}`, { common: { name: data?.name } });
        await this.stateService.extendObject(`onoff.${state[3]}.data`, { common: { name: data?.name } });
    }

    private addTrigger(schedule: Schedule, data: any): void {
        let triggerBuilder: DailyTriggerBuilder;

        if (data.triggerType === "TimeTrigger") {
            this.logger.logDebug("Wants TimeTrigger");
            triggerBuilder = new TimeTriggerBuilder().setHour(0).setMinute(0);
        } else if (data.triggerType === "AstroTrigger") {
            this.logger.logDebug("Wants AstroTrigger");
            triggerBuilder = new AstroTriggerBuilder().setAstroTime(AstroTime.Sunrise).setShift(0);
        } else {
            throw new Error(`Cannot add trigger of type ${data.triggerType}`);
        }

        triggerBuilder.setWeekdays(AllWeekdays).setId(this.getNextTriggerId(schedule.getTriggers()));

        if (data.actionType === "OnOffStateAction" && schedule instanceof OnOffSchedule) {
            this.logger.logDebug("Wants OnOffStateAction");
            triggerBuilder.setAction(schedule.getOnAction());
        } else {
            throw new Error(`Cannot add trigger with action of type ${data.actionType}`);
        }
        schedule.addTrigger(triggerBuilder.build());
    }

    private async addOneTimeTrigger(schedule: Schedule, data: any): Promise<void> {
        const t = JSON.parse(data.trigger);
        t.id = this.getNextTriggerId(schedule.getTriggers());
        const trigger = (await this.createOnOffScheduleSerializer(data.dataId))
            .getTriggerSerializer(schedule as OnOffSchedule)
            .deserialize(JSON.stringify(t));
        schedule.addTrigger(trigger);
    }

    private async updateTrigger(schedule: Schedule, triggerString: string, dataId: string): Promise<void> {
        let updated;
        if (schedule instanceof OnOffSchedule) {
            updated = (await this.createOnOffScheduleSerializer(dataId))
                .getTriggerSerializer(schedule)
                .deserialize(triggerString);
        } else {
            throw new Error(`Can not deserialize trigger for schedule of type ${typeof schedule}`);
        }
        schedule.updateTrigger(updated);
    }

    private async updateViews(data: any): Promise<void> {
        if (data) {
            if (data.newId && data.newId.endsWith(".data")) {
                const path = `${data.newId.replace(".data", "")}.views`;
                const valView = await this.stateService.getState(path);
                const newView = typeof valView === "string" ? JSON.parse(valView) : valView;
                if (newView && newView[data.namespace] && newView[data.namespace][data.prefix]) {
                    newView[data.namespace][data.prefix][data.widgetId] = data;
                } else {
                    newView[data.namespace] = {};
                    newView[data.namespace][data.prefix] = {};
                    newView[data.namespace][data.prefix][data.widgetId] = data;
                }
                this.stateService.setState(path, JSON.stringify(newView));
            }
            if (data.oldId && data.oldId.endsWith(".data")) {
                const oldPath = `${data.oldId.replace(".data", "")}.views`;
                const valOldView = await this.stateService.getState(oldPath);
                const oldView = typeof valOldView === "string" ? JSON.parse(valOldView) : valOldView;
                if (
                    oldView &&
                    oldView[data.namespace] &&
                    oldView[data.namespace][data.prefix] &&
                    oldView[data.namespace][data.prefix][data.widgetId]
                ) {
                    this.logger.logDebug(
                        "WObject.keys(oldView[data.namespace]).length: " + Object.keys(oldView[data.namespace]).length,
                    );
                    this.logger.logDebug(
                        "WObject.keys(oldView[data.namespace][data.prefix]).length: " +
                            Object.keys(oldView[data.namespace][data.prefix]).length,
                    );
                    this.logger.logDebug(
                        "WObject.keys(oldView[data.namespace][data.prefix][data.widgetId]).length: " +
                            Object.keys(oldView[data.namespace][data.prefix][data.widgetId]).length,
                    );
                    if (Object.keys(oldView[data.namespace]).length === 1) {
                        delete oldView[data.namespace];
                    } else if (Object.keys(oldView[data.namespace][data.prefix]).length === 1) {
                        oldView[data.namespace][data.prefix];
                    } else {
                        delete oldView[data.namespace][data.prefix][data.widgetId];
                    }
                    this.stateService.setState(oldPath, JSON.stringify(oldView));
                }
            }
        }
    }

    private changeOnOffSchedulesSwitchedValues(schedule: Schedule, data: any): void {
        if (!(schedule instanceof OnOffSchedule)) {
            throw new Error("Cannot change switched values when schedule type is not OnOffSchedule");
        }
        schedule.setOnAction(this.changeSwitchedValueOfOnOffScheduleAction(schedule.getOnAction(), data));
        schedule.setOffAction(this.changeSwitchedValueOfOnOffScheduleAction(schedule.getOffAction(), data));
    }

    private changeOnOffSchedulesSwitchedIds(schedule: Schedule, stateIds: string[]): void {
        if (!(schedule instanceof OnOffSchedule)) {
            throw new Error("Cannot change switched ids when schedule type is not OnOffSchedule");
        }
        schedule.getOnAction().setIdsOfStatesToSet(stateIds);
        schedule.getOffAction().setIdsOfStatesToSet(stateIds);
    }

    private changeSwitchedValueOfOnOffScheduleAction(
        action: OnOffStateAction<string | number | boolean>,
        data: any,
    ): OnOffStateAction<string | number | boolean> {
        switch (data.valueType) {
            case "boolean":
                return action.toBooleanValueType();
                break;
            case "number":
                return action.toNumberValueType(data.onValue, data.offValue);
                break;
            case "string":
                return action.toStringValueType(data.onValue, data.offValue);
                break;
            default:
                throw new Error(`Value Type ${data.valueType} not supported`);
        }
    }

    private getNextTriggerId(current: Trigger[]): string {
        const numbers = current
            .map((t) => t.getId())
            .map((id) => Number.parseInt(id, 10))
            .filter((id) => !Number.isNaN(id))
            .sort((a, b) => a - b);
        let newId = 0;
        for (let i = 0; i < numbers.length; i++) {
            if (numbers[i] > newId) {
                break;
            } else {
                newId++;
            }
        }
        return newId.toString();
    }
}
