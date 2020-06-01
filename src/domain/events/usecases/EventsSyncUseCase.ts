import { generateUid } from "d2/uid";
import _ from "lodash";
import memoize from "nano-memoize";
import { AggregatedD2ApiRepository } from "../../../data/aggregated/repositories/AggregatedD2ApiRepository";
import { EventsD2ApiRepository } from "../../../data/events/repositories/EventsD2ApiRepository";
import { mapPackageToD2 } from "../../../data/metadata/mappers/PackageMapper";
import { eventsTransformationsToDhis2 } from "../../../data/metadata/mappers/PackageTransformations";
import Instance, { MetadataMappingDictionary } from "../../../models/instance";
import { D2 } from "../../../types/d2";
import { D2Api, D2CategoryOptionCombo, D2Program } from "../../../types/d2-api";
import { SynchronizationBuilder } from "../../../types/synchronization";
import {
    cleanDataImportResponse,
    getCategoryOptionCombos,
    mapCategoryOptionCombo,
    mapOptionValue,
    mapProgramDataElement,
} from "../../../utils/synchronization";
import { DataValue } from "../../aggregated/entities/DataValue";
import { AggregatedRepository } from "../../aggregated/repositories/AggregatedRepository";
import { AggregatedSyncUseCase } from "../../aggregated/usecases/AggregatedSyncUseCase";
import InstanceEntity from "../../instance/Instance";
import {
    GenericSyncUseCase,
    SyncronizationPayload,
} from "../../synchronization/usecases/GenericSyncUseCase";
import { buildMetadataDictionary, cleanOrgUnitPath } from "../../synchronization/utils";
import { EventsPackage } from "../entities/EventsPackage";
import { ProgramEvent } from "../entities/ProgramEvent";
import { ProgramEventDataValue } from "../entities/ProgramEventDataValue";
import { EventsRepository } from "../repositories/EventsRepository";
import { MetadataRepository } from "../../metadata/MetadataRepositoriy";
import MetadataD2ApiRepository from "../../../data/metadata/repositories/MetadataD2ApiRepository";

export class EventsSyncUseCase extends GenericSyncUseCase {
    public readonly type = "events";
    public readonly fields =
        "id,name,programStages[programStageDataElements[dataElement[id,displayFormName,name]]],programIndicators[id,name]";
    private eventsRepository: EventsRepository;
    private aggregatedRepository: AggregatedRepository;
    private metadataRepository: MetadataRepository;

    constructor(d2: D2, api: D2Api, builder: SynchronizationBuilder) {
        super(d2, api, builder);

        //TODO: composition root - This dependency should be injected by constructor when we have
        // composition root
        this.eventsRepository = new EventsD2ApiRepository(api);
        this.aggregatedRepository = new AggregatedD2ApiRepository(api);
        this.metadataRepository = new MetadataD2ApiRepository(api);
    }

    public buildPayload = memoize(async () => {
        const { dataParams = {}, excludedIds = [] } = this.builder;
        const { enableAggregation = false } = dataParams;
        const { programs = [], programIndicators = [] } = await this.extractMetadata();

        const events = (
            await this.eventsRepository.getEvents(
                dataParams,
                programs.map(({ id }) => id)
            )
        ).map(event => {
            return dataParams.generateNewUid ? { ...event, event: generateUid() } : event;
        });

        const directIndicators = programIndicators.map(({ id }) => id);
        const indicatorsByProgram = _.flatten(
            programs?.map(
                ({ programIndicators }: Partial<D2Program>) =>
                    programIndicators?.map(({ id }) => id) ?? []
            )
        );

        const { dataValues: candidateDataValues = [] } = enableAggregation
            ? await this.aggregatedRepository.getAnalytics({
                  dataParams,
                  dimensionIds: [...directIndicators, ...indicatorsByProgram],
                  includeCategories: false,
              })
            : {};

        const dataValues = _.reject(candidateDataValues, ({ dataElement }) =>
            excludedIds.includes(dataElement)
        );

        return { events, dataValues };
    });

    public async postPayload(instance: Instance, instanceEntity: InstanceEntity) {
        const { events, dataValues } = await this.buildPayload();

        const eventsResponse = await this.postEventsPayload(instance, instanceEntity, events);

        const indicatorsResponse = await this.postIndicatorPayload(instance, dataValues);

        return _.compact([eventsResponse, indicatorsResponse]);
    }

    private async postEventsPayload(
        instance: Instance,
        instanceEntity: InstanceEntity,
        events: ProgramEvent[]
    ) {
        const { dataParams = {} } = this.builder;

        const payload = await this.mapPayload(instance, { events });

        if (!instanceEntity.apiVersion) {
            throw new Error(
                "Necessary api version of receiver instance to apply transformations to package is undefined"
            );
        }

        const versionedPayloadPackage = mapPackageToD2(
            instanceEntity.apiVersion,
            payload,
            eventsTransformationsToDhis2
        );
        console.debug("Events package", { events, payload, versionedPayloadPackage });

        const response = await this.eventsRepository.save(payload, dataParams);

        return cleanDataImportResponse(response, instance, this.type);
    }

    private async postIndicatorPayload(instance: Instance, dataValues: DataValue[]) {
        const { dataParams = {} } = this.builder;
        const { enableAggregation } = dataParams;
        if (!enableAggregation) return undefined;

        const aggregatedSync = new AggregatedSyncUseCase(this.d2, this.api, this.builder);
        const payload = await aggregatedSync.mapPayload(instance, { dataValues });
        console.debug("Program indicator package", { dataValues, payload });
        const response = await this.aggregatedRepository.save(payload, dataParams);

        return cleanDataImportResponse(response, instance, aggregatedSync.type);
    }

    public async buildDataStats() {
        const metadataPackage = await this.extractMetadata();
        const dictionary = buildMetadataDictionary(metadataPackage);
        const { events } = (await this.buildPayload()) as EventsPackage;

        return _(events)
            .groupBy("program")
            .mapValues((array, program) => ({
                program: dictionary[program]?.name ?? program,
                count: array.length,
                orgUnits: _.uniq(array.map(({ orgUnit, orgUnitName }) => orgUnitName ?? orgUnit)),
            }))
            .values()
            .value();
    }

    public async mapPayload(
        instance: Instance,
        payload: EventsPackage
    ): Promise<SyncronizationPayload> {
        const { events: oldEvents } = payload;
        const originCategoryOptionCombos = await getCategoryOptionCombos(this.api);
        const destinationCategoryOptionCombos = await getCategoryOptionCombos(instance.getApi());
        const defaultCategoryOptionCombos = await this.metadataRepository.getDefaultIds(
            "categoryOptionCombos"
        );

        const events = oldEvents
            .map(dataValue =>
                this.buildMappedDataValue(
                    dataValue,
                    instance.metadataMapping,
                    originCategoryOptionCombos,
                    destinationCategoryOptionCombos,
                    defaultCategoryOptionCombos[0]
                )
            )
            .filter(this.isDisabledEvent);

        return { events };
    }

    private buildMappedDataValue(
        { orgUnit, program, programStage, dataValues, attributeOptionCombo, ...rest }: ProgramEvent,
        globalMapping: MetadataMappingDictionary,
        originCategoryOptionCombos: Partial<D2CategoryOptionCombo>[],
        destinationCategoryOptionCombos: Partial<D2CategoryOptionCombo>[],
        defaultCategoryOptionCombo: string
    ): ProgramEvent {
        const { organisationUnits = {}, eventPrograms = {} } = globalMapping;
        const { mappedId: mappedProgram = program, mapping: innerMapping = {} } =
            eventPrograms[program] ?? {};
        const { programStages = {} } = innerMapping;
        const mappedOrgUnit = organisationUnits[orgUnit]?.mappedId ?? orgUnit;
        const mappedProgramStage = programStages[programStage]?.mappedId ?? programStage;
        const mappedCategory = mapCategoryOptionCombo(
            attributeOptionCombo ?? defaultCategoryOptionCombo,
            [innerMapping, globalMapping],
            originCategoryOptionCombos,
            destinationCategoryOptionCombos
        );

        return _.omit(
            {
                orgUnit: cleanOrgUnitPath(mappedOrgUnit),
                program: mappedProgram,
                programStage: mappedProgramStage,
                attributeOptionCombo: mappedCategory,
                dataValues: dataValues
                    .map(({ dataElement, value, ...rest }) => {
                        const {
                            mappedId: mappedDataElement = dataElement,
                            mapping: dataElementMapping = {},
                        } = mapProgramDataElement(
                            program,
                            programStage,
                            dataElement,
                            globalMapping
                        );

                        const mappedValue = mapOptionValue(value, [
                            dataElementMapping,
                            globalMapping,
                        ]);

                        return {
                            dataElement: mappedDataElement,
                            value: mappedValue,
                            ...rest,
                        };
                    })
                    .filter(this.isDisabledEvent),
                ...rest,
            },
            ["orgUnitName", "attributeCategoryOptions"]
        );
    }

    private isDisabledEvent(event: ProgramEvent | ProgramEventDataValue): boolean {
        return !_(event)
            .pick(["orgUnit", "attributeOptionCombo", "dataElement", "value"])
            .values()
            .includes("DISABLED");
    }
}
