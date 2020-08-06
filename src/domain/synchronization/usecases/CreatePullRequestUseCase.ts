import _ from "lodash";
import { cache } from "../../../utils/cache";
import { NamedRef } from "../../common/entities/Ref";
import { UseCase } from "../../common/entities/UseCase";
import { RepositoryFactory } from "../../common/factories/RepositoryFactory";
import { Instance } from "../../instance/entities/Instance";
import { InstanceRepositoryConstructor } from "../../instance/repositories/InstanceRepository";
import { MetadataPackage } from "../../metadata/entities/MetadataEntities";
import { MetadataResponsible } from "../../metadata/entities/MetadataResponsible";
import { AppNotification, MessageNotification } from "../../notifications/entities/Notification";
import {
    ReceivedPullRequestNotification,
    SentPullRequestNotification,
} from "../../notifications/entities/PullRequestNotification";
import { Repositories } from "../../Repositories";
import { Namespace } from "../../storage/Namespaces";
import { StorageRepositoryConstructor } from "../../storage/repositories/StorageRepository";
import { SynchronizationType } from "../entities/SynchronizationType";

interface CreatePullRequestParams {
    instance: Instance;
    type: SynchronizationType;
    ids: string[];
    payload: MetadataPackage;
    subject: string;
    description?: string;
    notificationUsers: Pick<MessageNotification, "users" | "userGroups">;
}

export class CreatePullRequestUseCase implements UseCase {
    constructor(private repositoryFactory: RepositoryFactory, private localInstance: Instance) {}

    public async execute({
        instance,
        type,
        ids,
        payload,
        subject,
        description = "",
        notificationUsers,
    }: CreatePullRequestParams): Promise<void> {
        const owner = await this.getOwner();
        const { users, userGroups } = await this.getResponsibles(instance, ids);

        const receivedPullRequest = ReceivedPullRequestNotification.create({
            subject,
            text: description,
            owner,
            users,
            userGroups,
            instance: this.localInstance.toPublicObject(),
            syncType: type,
            selectedIds: ids,
            payload,
            responsibles: { users, userGroups },
        });

        const sentPullRequest = SentPullRequestNotification.create({
            subject,
            text: description,
            owner,
            users,
            userGroups,
            instance: instance.toPublicObject(),
            syncType: type,
            selectedIds: ids,
            remoteNotification: receivedPullRequest.id,
        });

        await this.storageRepository(instance).saveObjectInCollection(
            Namespace.NOTIFICATIONS,
            receivedPullRequest
        );

        await this.storageRepository(this.localInstance).saveObjectInCollection(
            Namespace.NOTIFICATIONS,
            sentPullRequest
        );

        await this.sendMessage(instance, receivedPullRequest, notificationUsers);
    }

    @cache()
    private storageRepository(instance: Instance) {
        return this.repositoryFactory.get<StorageRepositoryConstructor>(
            Repositories.StorageRepository,
            [instance]
        );
    }

    @cache()
    private instanceRepository(instance: Instance) {
        return this.repositoryFactory.get<InstanceRepositoryConstructor>(
            Repositories.InstanceRepository,
            [instance, ""]
        );
    }

    private async getOwner(): Promise<NamedRef> {
        const { id, name } = await this.instanceRepository(this.localInstance).getUser();
        return { id, name };
    }

    private async getResponsibles(instance: Instance, ids: string[]) {
        const responsibles = await this.storageRepository(instance).listObjectsInCollection<
            MetadataResponsible
        >(Namespace.RESPONSIBLES);

        const metadataResponsibles = responsibles.filter(({ id }) => ids.includes(id));

        const users = _.uniqBy(
            metadataResponsibles.flatMap(({ users }) => users),
            "id"
        );

        const userGroups = _.uniqBy(
            metadataResponsibles.flatMap(({ userGroups }) => userGroups),
            "id"
        );

        return { users, userGroups };
    }

    private async sendMessage(
        instance: Instance,
        {
            subject,
            text,
            owner,
            instance: origin,
            users: responsibleUsers,
            userGroups: responsibleUserGroups,
        }: AppNotification,
        { users, userGroups }: Pick<MessageNotification, "users" | "userGroups">
    ): Promise<void> {
        const responsibles = [...responsibleUsers, ...responsibleUserGroups].map(
            ({ name }) => name
        );

        const message = [
            `Origin instance: ${origin.url}`,
            `User: ${owner.name}`,
            `Responsibles: ${responsibles.join(", ")}`,
            text,
        ];

        await this.instanceRepository(instance).sendMessage({
            subject: `[MDSync] Received Pull Request: ${subject}`,
            text: message.join("\n\n"),
            users: users.map(({ id }) => ({ id })),
            userGroups: userGroups.map(({ id }) => ({ id })),
        });
    }
}
