/** @odoo-module **/

import { Component, useState, onWillStart, onWillUpdateProps, onWillDestroy } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { useRecordObserver } from "@web/model/relational_model/utils";

function getRecordBaseSeconds(record) {
    if (!record || !record.data) return 0;
    if (typeof record.data.timer_display_seconds === "number" && record.data.timer_display_seconds >= 0) {
        return record.data.timer_display_seconds;
    }
    const totalSec = Number(record.data.timer_total_seconds) || 0;
    const effSec = Math.round((Number(record.data.effective_hours) || 0) * 3600);
    return Math.max(totalSec, effSec);
}

function formatTime(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return "00:00:00";
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export class TaskTimerWidget extends Component {
    static template = "gannt_lt.TaskTimerWidget";
    static props = {
        ...standardWidgetProps,
        "*": true,
    };

    setup() {
        this.observedRecord = null;
        this.interval = null;
        this.baseSeconds = 0;
        this.clientStartMs = 0;
        this.activeTaskId = null;
        this.lastTimerStart = null;
        this.wasRunning = false;

        this.state = useState({
            elapsedSeconds: 0,
        });

        const syncState = (rec = null) => {
            if (rec) this.observedRecord = rec;
            const record = this.activeRecord;
            if (!record || !record.data) {
                this.state.elapsedSeconds = 0;
                this.stopTicking();
                return;
            }

            const isRunning = Boolean(record.data.is_timer_running);
            const taskId = record.resId || record.data.id;
            const timerStart = record.data.timer_start;
            const serverSeconds = getRecordBaseSeconds(record);

            const taskChanged = this.activeTaskId !== taskId;
            const runStateChanged = this.wasRunning !== isRunning;
            const startTimestampChanged = (String(this.lastTimerStart) !== String(timerStart));

            this.activeTaskId = taskId;
            this.lastTimerStart = timerStart;
            this.wasRunning = isRunning;

            if (isRunning) {
                // If newly running, or record/task/session changed, sync baseline and start client ticking
                if (runStateChanged || taskChanged || startTimestampChanged || !this.interval) {
                    this.baseSeconds = serverSeconds;
                    this.clientStartMs = Date.now();
                    this.state.elapsedSeconds = this.baseSeconds;
                    this.startTicking();
                }
            } else {
                this.stopTicking();
                this.baseSeconds = serverSeconds;
                this.state.elapsedSeconds = serverSeconds;
            }
        };

        onWillStart(() => syncState());

        try {
            useRecordObserver((record) => {
                syncState(record);
            });
        } catch (e) {
            // fallback if not inside a record observer context
        }

        onWillUpdateProps((nextProps) => {
            syncState(nextProps.record);
        });

        onWillDestroy(() => {
            this.stopTicking();
        });
    }

    get activeRecord() {
        return this.observedRecord || this.props.record;
    }

    get isRunning() {
        return Boolean(this.activeRecord?.data?.is_timer_running);
    }

    get isDone() {
        const state = this.activeRecord?.data?.state;
        return state === "1_done" || state === "1_canceled";
    }

    get hasTime() {
        return this.isRunning || this.state.elapsedSeconds > 0;
    }

    startTicking() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.interval = setInterval(() => {
            if (this.isRunning) {
                const clientDelta = Math.max(0, Math.floor((Date.now() - this.clientStartMs) / 1000));
                this.state.elapsedSeconds = this.baseSeconds + clientDelta;
            } else {
                this.stopTicking();
            }
        }, 1000);
    }

    stopTicking() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    get formattedTime() {
        return formatTime(this.state.elapsedSeconds);
    }
}

export const taskTimerWidget = {
    component: TaskTimerWidget,
    fieldDependencies: [
        { name: "is_timer_running", type: "boolean" },
        { name: "timer_start", type: "datetime" },
        { name: "timer_total_seconds", type: "integer" },
        { name: "timer_display_seconds", type: "integer" },
        { name: "effective_hours", type: "float" },
        { name: "state", type: "selection" },
    ],
};

registry.category("view_widgets").add("task_timer_widget", taskTimerWidget);
registry.category("fields").add("task_timer_widget", taskTimerWidget);
