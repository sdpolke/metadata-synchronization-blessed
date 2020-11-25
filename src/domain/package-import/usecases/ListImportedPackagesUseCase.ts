import { Namespace } from "../../../data/storage/Namespaces";
import { Either } from "../../common/entities/Either";
import { UseCase } from "../../common/entities/UseCase";
import { RepositoryFactory } from "../../common/factories/RepositoryFactory";
import { Instance } from "../../instance/entities/Instance";
import { ImportedPackageData } from "../entities/ImportedPackage";

type ListImportedPackageError = "UNEXPECTED_ERROR";

export class ListImportedPackagesUseCase implements UseCase {
    constructor(private repositoryFactory: RepositoryFactory, private localInstance: Instance) {}

    public async execute(): Promise<Either<ListImportedPackageError, ImportedPackageData[]>> {
        try {
            const items = await this.repositoryFactory
                .storageRepository(this.localInstance)
                .listObjectsInCollection<ImportedPackageData>(Namespace.IMPORTEDPACKAGES);

            return Either.success(items);
        } catch (error) {
            return Either.error("UNEXPECTED_ERROR");
        }
    }
}
