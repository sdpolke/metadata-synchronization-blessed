import { Namespace } from "../../../data/storage/Namespaces";
import { UseCase } from "../../common/entities/UseCase";
import { RepositoryFactory } from "../../common/factories/RepositoryFactory";
import { Instance } from "../../instance/entities/Instance";
import { MetadataModule } from "../entities/MetadataModule";
import { BaseModule, Module } from "../entities/Module";

export class ListModulesUseCase implements UseCase {
    constructor(private repositoryFactory: RepositoryFactory, private localInstance: Instance) {}

    public async execute(
        bypassSharingSettings = false,
        instance = this.localInstance
    ): Promise<Module[]> {
        const userGroups = await this.repositoryFactory
            .instanceRepository(this.localInstance)
            .getUserGroups();
        const { id: userId } = await this.repositoryFactory
            .instanceRepository(this.localInstance)
            .getUser();

        const data = (
            await this.repositoryFactory
                .storageRepository(instance)
                .listObjectsInCollection<BaseModule>(Namespace.MODULES)
        ).filter(module => !module.autogenerated);

        return data
            .map(module => {
                switch (module.type) {
                    case "metadata":
                        return MetadataModule.build(module);
                    default:
                        throw new Error("Unknown module");
                }
            })
            .filter(
                module => bypassSharingSettings || module.hasPermissions("read", userId, userGroups)
            );
    }
}
