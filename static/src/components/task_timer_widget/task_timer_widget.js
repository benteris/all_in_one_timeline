/** @odoo-module **/

import { Component, useState, onWillStart, onWillRender, onWillUpdateProps, onWillDestroy } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { useRecordObserver } from "@web/model/relational_model/utils";

function getElapsedSeconds(record) {
    if (!record || !record.data) return 0;
    const isRunning = Boolean(record.data.is_timer_running);
    const effectiveHours = Number(record.data.effective_hours) || 0;
    const baseSeconds = Math.round(effectiveHours * 3600);

    if (isRunning && record.data.timer_start) {
        let startTimeMs = 0;
        const ts = record.data.timer_start;
        if (typeof ts === "string") {
            const utcStr = ts.includes("Z") || ts.includes("+") ? ts : ts.replace(" ", "T") + "Z";
            startTimeMs = new Date(utcStr).getTime();
        } else if (ts && typeof ts.toMillis === "function") {
            startTimeMs = ts.toMillis();
        } else if (ts && typeof ts.toJSDate === "function") {
            startTimeMs = ts.toJSDate().getTime();
        } else if (ts && typeof ts.ts === "number") {
            startTimeMs = ts.ts;
        } else if (ts && ts instanceof Date) {
            startTimeMs = ts.getTime();
        } else if (typeof ts === "number") {
            startTimeMs = ts;
        }

        if (startTimeMs > 0 && !isNaN(startTimeMs)) {
            const currentSessionSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
            return baseSeconds + currentSessionSeconds;
        }
    }
    return baseSeconds;
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
    static template = "all_in_one_timeline.TaskTimerWidget";
    static props = {
        ...standardWidgetProps,
        "*": true,
    };

    setup() {
        this.observedRecord = null;
        this.state = useState({
            elapsedSeconds: this.calcElapsed(),
        });
        this.interval = null;

        const syncState = (rec = null) => {
            if (rec) this.observedRecord = rec;
            this.state.elapsedSeconds = this.calcElapsed();
            if (this.isRunning) {
                this.startTicking();
            } else {
                this.stopTicking();
            }
        };

        onWillStart(() => syncState());
        onWillRender(() => syncState());

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

    calcElapsed(rec = null) {
        const record = rec || this.activeRecord;
        return getElapsedSeconds(record);
    }

    startTicking() {
        if (this.interval) return;
        this.interval = setInterval(() => {
            if (this.isRunning) {
                this.state.elapsedSeconds = this.calcElapsed();
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
        { name: "effective_hours", type: "float" },
    ],
};

registry.category("view_widgets").add("task_timer_widget", taskTimerWidget);
registry.category("fields").add("task_timer_widget", taskTimerWidget);
