import { Instance } from "../../domain/instance/entities/Instance";
import { InstanceMessage } from "../../domain/instance/entities/Message";
import { User } from "../../domain/instance/entities/User";
import { InstanceRepository } from "../../domain/instance/repositories/InstanceRepository";
import { OrganisationUnit } from "../../domain/metadata/entities/MetadataEntities";
import { D2Api } from "../../types/d2-api";
import { cache } from "../../utils/cache";
import { getD2APiFromInstance } from "../../utils/d2-utils";

export class InstanceD2ApiRepository implements InstanceRepository {
    private api: D2Api;

    constructor(instance: Instance) {
        this.api = getD2APiFromInstance(instance);
    }

    public getApi(): D2Api {
        return this.api;
    }

    @cache()
    public async getUser(): Promise<User> {
        return this.api.currentUser
            .get({
                fields: {
                    id: true,
                    name: true,
                    email: true,
                    userGroups: { id: true, name: true },
                    organisationUnits: { id: true, name: true },
                    dataViewOrganisationUnits: { id: true, name: true },
                },
            })
            .getData();
    }

    @cache()
    public async getVersion(): Promise<string> {
        const { version } = await this.api.system.info.getData();
        return version;
    }

    @cache()
    public getBaseUrl(): string {
        return this.api.baseUrl;
    }

    @cache()
    public async getOrgUnitRoots(): Promise<
        Pick<OrganisationUnit, "id" | "name" | "displayName" | "path">[]
    > {
        const { objects } = await this.api.models.organisationUnits
            .get({
                paging: false,
                filter: { level: { eq: "1" } },
                fields: { id: true, name: true, displayName: true, path: true },
            })
            .getData();

        return objects;
    }

    public async sendMessage(message: InstanceMessage): Promise<void> {
        //@ts-ignore https://github.com/EyeSeeTea/d2-api/pull/52
        await this.api.messageConversations.post(message).getData();
    }
}
