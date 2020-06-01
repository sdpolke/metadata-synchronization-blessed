import i18n from "@dhis2/d2-i18n";
import { D2Api } from "../../types/d2-api";
import _ from "lodash";
import memoize from "nano-memoize";

import Instance from "../../models/instance";

import InstanceEntity from "../../domain/instance/Instance";

import SyncReport from "../../models/syncReport";
import SyncRule from "../../models/syncRule";
import { D2, ImportStatus } from "../../types/d2";
import {
    AggregatedDataStats,
    EventsDataStats,
    SynchronizationBuilder,
    SynchronizationReportStatus,
    SynchronizationResult,
    SyncRuleType,
} from "../../types/synchronization";
import { promiseMap } from "../../utils/common";
import { getMetadata } from "../../utils/synchronization";
import { AggregatedSync } from "./aggregated";
import { DeletedSync } from "./deleted";
import { EventsSync } from "./events";
import { MetadataSync } from "./metadata";
import { MetadataPackage } from "../../domain/synchronization/MetadataEntities";
import { AggregatedPackage, EventsPackage } from "../../domain/synchronization/DataEntities";
import InstanceRepository from "../../domain/instance/InstanceRepository";
import InstanceD2ApiRepository from "../../data/instance/InstanceD2ApiRepository";

export type SyncronizationClass =
    | typeof MetadataSync
    | typeof AggregatedSync
    | typeof EventsSync
    | typeof DeletedSync;
export type SyncronizationPayload = MetadataPackage | AggregatedPackage | EventsPackage;

export abstract class GenericSync {
    protected readonly d2: D2;
    protected readonly api: D2Api;
    protected readonly builder: SynchronizationBuilder;
    protected readonly instanceRepository: InstanceRepository;

    public abstract readonly type: SyncRuleType;
    public readonly fields: string = "id,name";

    constructor(d2: D2, api: D2Api, builder: SynchronizationBuilder) {
        this.d2 = d2;
        this.api = api;
        this.builder = builder;

        //TODO: composition root - This dependency should be injected by constructor when we have
        // composition root
        this.instanceRepository = new InstanceD2ApiRepository(api);
    }

    public abstract async buildPayload(): Promise<SyncronizationPayload>;
    public abstract async mapPayload(
        instance: Instance,
        payload: SyncronizationPayload
    ): Promise<SyncronizationPayload>;

    // We start to use domain concepts:
    // for the moment old model instance and domain entity instance are going to live together for a while on sync classes.
    // Little by little through refactors the old instance model should disappear
    public abstract async postPayload(
        instance: Instance,
        instanceEntity: InstanceEntity
    ): Promise<SynchronizationResult[]>;
    public abstract async buildDataStats(): Promise<
        AggregatedDataStats[] | EventsDataStats[] | undefined
    >;

    public extractMetadata = memoize(async () => {
        const cleanIds = this.builder.metadataIds.map(id => _.last(id.split("-")) ?? id);
        return getMetadata(this.api, cleanIds, this.fields);
    });

    private async buildSyncReport() {
        const { syncRule } = this.builder;
        const metadataPackage = await this.extractMetadata();
        const dataStats = await this.buildDataStats();
        const currentUser = await this.api.currentUser
            .get({ fields: { userCredentials: { username: true } } })
            .getData();

        return SyncReport.build({
            user: currentUser.userCredentials.username ?? "Unknown",
            types: _.keys(metadataPackage),
            status: "RUNNING" as SynchronizationReportStatus,
            syncRule,
            type: this.type,
            dataStats,
        });
    }

    public async *execute() {
        const { targetInstances: targetInstanceIds, syncRule } = this.builder;
        yield { message: i18n.t("Preparing synchronization") };

        // Build instance list
        const targetInstances = _.compact(
            await promiseMap(targetInstanceIds, id => Instance.get(this.api, id))
        );

        // Initialize sync report
        const syncReport = await this.buildSyncReport();
        syncReport.addSyncResult(
            ...targetInstances.map(instance => ({
                instance: instance.toObject(),
                status: "PENDING" as ImportStatus,
                date: new Date(),
                type: this.type,
            }))
        );

        yield { syncReport };
        for (const instance of targetInstances) {
            yield {
                message: i18n.t("Importing data in instance {{instance}}", {
                    instance: instance.name,
                    interpolation: { escapeValue: false },
                }),
            };

            try {
                console.debug("Start import on destination instance", instance.toObject());

                const instanceEntity = await this.instanceRepository.getById(instance.id);
                const syncResults = await this.postPayload(instance, instanceEntity);
                syncReport.addSyncResult(...syncResults);

                console.debug("Finished importing data on instance", instance.toObject());
            } catch (error) {
                console.error("err", error);
                syncReport.addSyncResult({
                    status: "ERROR",
                    instance: instance.toObject(),
                    date: new Date(),
                    type: this.type,
                });
            }

            yield { syncReport };
        }

        // Phase 4: Update sync rule last executed date
        if (syncRule) {
            const oldRule = await SyncRule.get(this.api, syncRule);
            const updatedRule = oldRule.updateLastExecuted(new Date());
            await updatedRule.save(this.api);
        }

        // Phase 5: Update parent task status
        syncReport.setStatus(syncReport.hasErrors() ? "FAILURE" : "DONE");
        yield { syncReport, done: true };

        return syncReport;
    }
}
