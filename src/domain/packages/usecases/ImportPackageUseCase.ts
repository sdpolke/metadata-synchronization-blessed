import { Namespace } from "../../../data/storage/Namespaces";
import { debug } from "../../../utils/debug";
import { UseCase } from "../../common/entities/UseCase";
import { Repositories, RepositoryFactory } from "../../common/factories/RepositoryFactory";
import { DataSource } from "../../instance/entities/DataSource";
import { Instance } from "../../instance/entities/Instance";
import { User } from "../../instance/entities/User";
import {
    InstanceRepository,
    InstanceRepositoryConstructor,
} from "../../instance/repositories/InstanceRepository";
import { MetadataMappingDictionary } from "../../mapping/entities/MetadataMapping";
import { MappingMapper } from "../../mapping/helpers/MappingMapper";
import { MetadataPackage } from "../../metadata/entities/MetadataEntities";
import {
    MetadataRepository,
    MetadataRepositoryConstructor,
} from "../../metadata/repositories/MetadataRepository";
import { MetadataModule } from "../../modules/entities/MetadataModule";
import { BaseModule } from "../../modules/entities/Module";
import { SynchronizationResult } from "../../reports/entities/SynchronizationResult";
import { StorageClient } from "../../storage/repositories/StorageClient";

import { TransformationRepositoryConstructor } from "../../transformations/repositories/TransformationRepository";
import { BasePackage, Package } from "../entities/Package";

export class ImportPackageUseCase implements UseCase {
    instanceRepository: InstanceRepository;

    constructor(private repositoryFactory: RepositoryFactory, private localInstance: Instance) {
        this.instanceRepository = this.repositoryFactory.get<InstanceRepositoryConstructor>(
            Repositories.InstanceRepository,
            [this.localInstance, ""]
        );
    }

    public async execute(
        item: Package,
        mapping: MetadataMappingDictionary = {},
        originInstance: DataSource,
        destinationInstance: DataSource = this.localInstance
    ): Promise<SynchronizationResult> {
        const originCategoryOptionCombos = await this.repositoryFactory
            .metadataRepository(originInstance)
            .getCategoryOptionCombos();
        const destinationCategoryOptionCombos = await this.repositoryFactory
            .metadataRepository(destinationInstance)
            .getCategoryOptionCombos();

        const mapper = new MappingMapper(
            mapping,
            originCategoryOptionCombos,
            destinationCategoryOptionCombos
        );

        const payload = mapper.applyMapping(item.contents);
        const result = await this.repositoryFactory
            .metadataRepository(destinationInstance)
            .save(payload);

        debug("Import package", {
            originInstance,
            originCategoryOptionCombos,
            destinationCategoryOptionCombos,
            mapping,
            payload,
            result,
        });

        if (result.status === "SUCCESS") {
            await this.createPackageInLocalIfRequired(item, payload);
        }

        return result;
    }

    private async createPackageInLocalIfRequired(
        packageToCreate: Package,
        importedPayload: MetadataPackage
    ): Promise<void> {
        const storageClient = await this.getStorageClient();

        const existedPackage = await storageClient.getObjectInCollection<BasePackage>(
            Namespace.PACKAGES,
            packageToCreate.id
        );

        if (!existedPackage) {
            const user = await this.instanceRepository.getUser();
            const userRef = { id: user.id, name: user.name };

            const instance = this.instanceRepository.getBaseUrl();

            const newPackage = packageToCreate.update({
                user: userRef,
                lastUpdatedBy: userRef,
                module: { ...packageToCreate.module, instance },
                lastUpdated: new Date(),
                contents: importedPayload,
            });

            await storageClient.saveObjectInCollection(Namespace.PACKAGES, newPackage);

            await this.createOrUpdateModule(newPackage, user, instance, importedPayload);
        }
    }

    private async createOrUpdateModule(
        packageToCreate: Package,
        user: User,
        instance: string,
        importedPayload: MetadataPackage
    ): Promise<void> {
        const storageClient = await this.getStorageClient();

        const existedModuleData = await storageClient.getObjectInCollection<BaseModule>(
            Namespace.MODULES,
            packageToCreate.module.id
        );

        const metadataIds = this.extractMeyadataIds(importedPayload);

        if (existedModuleData) {
            const existedModule = MetadataModule.build(existedModuleData).update({
                lastPackageVersion: packageToCreate.version,
                metadataIds,
                lastUpdated: new Date(),
                lastUpdatedBy: user,
            });

            await storageClient.saveObjectInCollection(Namespace.MODULES, existedModule);
        } else {
            const { module } = packageToCreate;

            const newModule = MetadataModule.build({
                ...module,
                autogenerated: true,
                lastPackageVersion: packageToCreate.version,
                metadataIds,
                instance,
                lastUpdated: new Date(),
                lastUpdatedBy: user,
                user: user,
                userGroupAccesses: [
                    {
                        ...module.department,
                        displayName: module.department.name,
                        access: "rw----",
                    },
                ],
            });

            await storageClient.saveObjectInCollection(Namespace.MODULES, newModule);
        }
    }

    private extractMeyadataIds(metadataPackage: MetadataPackage) {
        return Object.entries(metadataPackage).reduce((acc: string[], [_key, items]) => {
            const ids: string[] = items ? items.map(item => item.id) : [];
            return [...acc, ...ids];
        }, []);
    }

    protected getMetadataRepository(
        remoteInstance: DataSource = this.localInstance
    ): MetadataRepository {
        const transformationRepository = this.repositoryFactory.get<
            TransformationRepositoryConstructor
        >(Repositories.TransformationRepository, []);

        const tag = remoteInstance.type === "json" ? "json" : undefined;

        return this.repositoryFactory.get<MetadataRepositoryConstructor>(
            Repositories.MetadataRepository,
            [remoteInstance, transformationRepository],
            tag
        );
    }

    private async getStorageClient(): Promise<StorageClient> {
        return await this.repositoryFactory
            .configRepository(this.localInstance)
            .getStorageClient();
    }
}
