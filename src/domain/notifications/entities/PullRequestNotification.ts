import { generateUid } from "d2/uid";
import { NamedRef } from "../../common/entities/Ref";
import { MetadataPackage } from "../../metadata/entities/MetadataEntities";
import { SynchronizationType } from "../../synchronization/entities/SynchronizationType";
import { BaseNotification } from "./Notification";

export type PullRequestStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "IMPORTED"
    | "IMPORTED_WITH_ERRORS";

export interface PullRequestNotification extends BaseNotification {
    syncType: SynchronizationType;
    selectedIds: string[];
    status: PullRequestStatus;
}

export interface SentPullRequestNotification extends PullRequestNotification {
    type: "sent-pull-request";
    remoteNotification: string;
}

export interface ReceivedPullRequestNotification extends PullRequestNotification {
    type: "received-pull-request";
    payload: MetadataPackage;
    responsibles: {
        users: NamedRef[];
        userGroups: NamedRef[];
    };
}

export class SentPullRequestNotification implements SentPullRequestNotification {
    static create(
        props: Omit<
            SentPullRequestNotification,
            "id" | "notification" | "type" | "read" | "created" | "status"
        >
    ): SentPullRequestNotification {
        return {
            ...props,
            id: generateUid(),
            type: "sent-pull-request",
            read: false,
            created: new Date(),
            status: "PENDING",
        };
    }
}

export class ReceivedPullRequestNotification implements ReceivedPullRequestNotification {
    static create(
        props: Omit<
            ReceivedPullRequestNotification,
            "id" | "notification" | "type" | "read" | "created" | "status"
        >
    ): ReceivedPullRequestNotification {
        return {
            ...props,
            id: generateUid(),
            type: "received-pull-request",
            read: false,
            created: new Date(),
            status: "PENDING",
        };
    }
}
