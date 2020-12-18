import { Icon } from "@material-ui/core";
import {
    ConfirmationDialog,
    ConfirmationDialogProps,
    DatePicker,
    MetaObject,
    ObjectsTable,
    ObjectsTableDetailField,
    ReferenceObject,
    SearchResult,
    ShareUpdate,
    TableAction,
    TableColumn,
    TableSelection,
    TableState,
    useLoading,
    useSnackbar,
} from "d2-ui-components";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import { Instance } from "../../../../../domain/instance/entities/Instance";
import { SynchronizationReport } from "../../../../../domain/reports/entities/SynchronizationReport";
import {
    SynchronizationRule,
    SynchronizationRuleData,
} from "../../../../../domain/rules/entities/SynchronizationRule";
import { SynchronizationType } from "../../../../../domain/synchronization/entities/SynchronizationType";
import i18n from "../../../../../locales";
import { promiseMap } from "../../../../../utils/common";
import { getValueForCollection } from "../../../../../utils/d2-ui-components";
import { getValidationMessages } from "../../../../../utils/old-validations";
import {
    getUserInfo,
    isAppConfigurator,
    isAppExecutor,
    isGlobalAdmin,
    UserInfo,
} from "../../../../../utils/permissions";
import { requestJSONDownload } from "../../../../../utils/synchronization";
import Dropdown from "../../../../react/core/components/dropdown/Dropdown";
import PageHeader from "../../../../react/core/components/page-header/PageHeader";
import {
    PullRequestCreation,
    PullRequestCreationDialog,
} from "../../../../react/core/components/pull-request-creation-dialog/PullRequestCreationDialog";
import { SharingDialog } from "../../../../react/core/components/sharing-dialog/SharingDialog";
import SyncSummary from "../../../../react/core/components/sync-summary/SyncSummary";
import { TestWrapper } from "../../../../react/core/components/test-wrapper/TestWrapper";
import { useAppContext } from "../../../../react/core/contexts/AppContext";

const config: {
    [key: string]: {
        title: string;
    };
} = {
    metadata: {
        title: i18n.t("Metadata Synchronization Rules"),
    },
    aggregated: {
        title: i18n.t("Aggregated Data Synchronization Rules"),
    },
    events: {
        title: i18n.t("Events Synchronization Rules"),
    },
};

const enabledFilterData = [
    { id: "enabled", name: i18n.t("Enabled") },
    { id: "disabled", name: i18n.t("Disabled") },
];

const SyncRulesPage: React.FC = () => {
    const { api, compositionRoot } = useAppContext();
    const loading = useLoading();
    const snackbar = useSnackbar();
    const history = useHistory();
    const { type } = useParams() as { type: SynchronizationType };
    const { title } = config[type];

    const [rows, setRows] = useState<SynchronizationRule[]>([]);

    const [refreshKey, setRefreshKey] = useState(0);
    const [selection, updateSelection] = useState<TableSelection[]>([]);
    const [toDelete, setToDelete] = useState<string[]>([]);
    const [search, setSearchFilter] = useState("");
    const [targetInstanceFilter, setTargetInstanceFilter] = useState("");
    const [enabledFilter, setEnabledFilter] = useState("");
    const [lastExecutedFilter, setLastExecutedFilter] = useState<Date | null>(null);
    const [syncReport, setSyncReport] = useState<SynchronizationReport | null>(null);
    const [sharingSettingsObject, setSharingSettingsObject] = useState<MetaObject | null>(null);
    const [pullRequestProps, setPullRequestProps] = useState<PullRequestCreation>();
    const [dialogProps, updateDialog] = useState<ConfirmationDialogProps | null>(null);

    useEffect(() => {
        compositionRoot.rules
            .list({
                filters: { type, targetInstanceFilter, enabledFilter, lastExecutedFilter, search },
                paging: false,
            })
            .then(({ rows }) => setRows(rows));
    }, [
        compositionRoot,
        refreshKey,
        type,
        search,
        targetInstanceFilter,
        enabledFilter,
        lastExecutedFilter,
        sharingSettingsObject,
    ]);

    const [allInstances, setAllInstances] = useState<Instance[]>([]);
    const [userInfo, setUserInfo] = useState<UserInfo>();
    const [globalAdmin, setGlobalAdmin] = useState(false);
    const [appConfigurator, setAppConfigurator] = useState(false);
    const [appExecutor, setAppExecutor] = useState(false);

    useEffect(() => {
        compositionRoot.instances.list().then(setAllInstances);
        getUserInfo(api).then(setUserInfo);
        isGlobalAdmin(api).then(setGlobalAdmin);
        isAppConfigurator(api).then(setAppConfigurator);
        isAppExecutor(api).then(setAppExecutor);
    }, [api, compositionRoot]);

    const getTargetInstances = (rule: SynchronizationRule) => {
        return _(rule.targetInstances)
            .map(id => allInstances.find(instance => instance.id === id))
            .compact()
            .map(({ name }) => ({ name }));
    };

    const getReadableFrequency = (rule: SynchronizationRule) => {
        return rule.longFrequency;
    };

    const columns: TableColumn<SynchronizationRule>[] = [
        { name: "name", text: i18n.t("Name"), sortable: true },
        {
            name: "targetInstances",
            text: i18n.t("Destination instances"),
            sortable: false,
            getValue: (ruleData: SynchronizationRule) =>
                getTargetInstances(ruleData)
                    .map(e => e.name)
                    .join(", "),
        },
        {
            name: "frequency",
            text: i18n.t("Frequency"),
            sortable: true,
            getValue: getReadableFrequency,
        },
        {
            name: "enabled",
            text: i18n.t("Scheduling"),
            sortable: true,
            getValue: ({ enabled }) => (enabled ? i18n.t("Enabled") : i18n.t("Disabled")),
        },
        {
            name: "lastExecuted",
            text: i18n.t("Last executed"),
            sortable: true,
        },
    ];

    const details: ObjectsTableDetailField<SynchronizationRule>[] = [
        { name: "name", text: i18n.t("Name") },
        { name: "description", text: i18n.t("Description") },
        {
            name: "frequency",
            text: i18n.t("Frequency"),
            getValue: getReadableFrequency,
        },
        {
            name: "enabled",
            text: i18n.t("Scheduling"),
            getValue: ({ enabled }) => (enabled ? i18n.t("Enabled") : i18n.t("Disabled")),
        },
        { name: "lastExecuted", text: i18n.t("Last executed") },
        {
            name: "targetInstances",
            text: i18n.t("Destination instances"),
            getValue: ruleData => getValueForCollection(getTargetInstances(ruleData)),
        },
    ];

    const downloadJSON = async (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        const rule = await compositionRoot.rules.get(id);
        if (!rule) return;

        loading.show(true, "Generating JSON file");
        const sync = compositionRoot.sync[rule.type](rule.toBuilder());
        //I think this is type MetadataPackage
        const payload = await sync.buildPayload();

        requestJSONDownload(payload, rule);
        loading.reset();
    };

    const back = () => {
        history.push("/dashboard");
    };

    const confirmDelete = async () => {
        loading.show(true, i18n.t("Deleting Sync Rules"));

        await promiseMap(toDelete, id => compositionRoot.rules.delete(id));

        snackbar.success(
            i18n.t("Successfully deleted {{count}} rules", { count: toDelete.length })
        );

        loading.reset();
        setToDelete([]);
        updateSelection([]);
        setRefreshKey(Math.random());
    };

    const createRule = () => {
        history.push(`/sync-rules/${type}/new`);
    };

    const editRule = (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        history.push(`/sync-rules/${type}/edit/${id}`);
    };

    const replicateRule = async (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        const rule = await compositionRoot.rules.get(id);
        if (!rule) return;

        history.push({
            pathname: `/sync-rules/${type}/new`,
            state: { syncRule: rule.replicate() },
        });
    };

    const executeRule = async (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        const rule = await compositionRoot.rules.get(id);
        if (!rule) return;

        const { builder, id: syncRule, type = "metadata" } = rule;
        loading.show(true, i18n.t("Synchronizing {{name}}", rule));

        const result = await compositionRoot.sync.prepare(type, builder);
        const sync = compositionRoot.sync[type]({ ...builder, syncRule });

        const createPullRequest = async () => {
            const result = await compositionRoot.instances.getById(builder.originInstance);

            result.match({
                success: instance => {
                    setPullRequestProps({
                        instance,
                        builder,
                        type,
                    });
                },
                error: () => {
                    snackbar.error(i18n.t("Unable to create pull request"));
                },
            });
        };

        const synchronize = async () => {
            //added payload
            for await (const { message, syncReport, done } of sync.execute()) {
                if (message) loading.show(true, message);
                if (syncReport) await compositionRoot.reports.save(syncReport);
                if (done && syncReport) setSyncReport(syncReport);
            }
        };

        await result.match({
            success: async () => {
                await synchronize();
            },
            error: async code => {
                switch (code) {
                    case "PULL_REQUEST":
                        await createPullRequest();
                        break;
                    case "PULL_REQUEST_RESPONSIBLE":
                        updateDialog({
                            title: i18n.t("Pull metadata"),
                            description: i18n.t(
                                "You are one of the reponsibles for the selected items.\nDo you want to directly pull the metadata?"
                            ),
                            onCancel: () => {
                                updateDialog(null);
                            },
                            onSave: async () => {
                                updateDialog(null);
                                await synchronize();
                            },
                            onInfoAction: async () => {
                                updateDialog(null);
                                await createPullRequest();
                            },
                            cancelText: i18n.t("Cancel"),
                            saveText: i18n.t("Proceed"),
                            infoActionText: i18n.t("Create pull request"),
                        });
                        break;
                    case "INSTANCE_NOT_FOUND":
                        snackbar.warning(i18n.t("Couldn't connect with instance"));
                        break;
                    default:
                        snackbar.error(i18n.t("Unknown synchronization error"));
                }
            },
        });

        setRefreshKey(Math.random());
        loading.reset();
    };

    const toggleEnable = async (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        const oldSyncRule = await compositionRoot.rules.get(id);
        if (!oldSyncRule) return;

        const syncRule = oldSyncRule.updateEnabled(!oldSyncRule.enabled);
        const errors = getValidationMessages(syncRule);
        if (errors.length > 0) {
            snackbar.error(errors.join("\n"), {
                autoHideDuration: null,
            });
        } else {
            await compositionRoot.rules.save(syncRule);
            snackbar.success(i18n.t("Successfully updated sync rule"));
            setRefreshKey(Math.random());
        }
    };

    const openSharingSettings = async (ids: string[]) => {
        const id = _.first(ids);
        if (!id) return;

        const syncRule = await compositionRoot.rules.get(id);
        if (!syncRule) return;

        setSharingSettingsObject({
            object: syncRule.toObject(),
            meta: { allowPublicAccess: true, allowExternalAccess: false },
        });
    };

    const verifyUserHasAccess = (rules: SynchronizationRule[], condition = false) => {
        if (globalAdmin) return true;

        for (const rule of rules) {
            if (!!userInfo && !rule.isVisibleToUser(userInfo, "WRITE")) return false;
        }

        return condition;
    };

    const verifyUserCanEdit = (rules: SynchronizationRule[]) => {
        return verifyUserHasAccess(rules, appConfigurator);
    };

    const verifyUserCanEditSharingSettings = (rules: SynchronizationRule[]) => {
        return verifyUserHasAccess(rules, appConfigurator);
    };

    const verifyUserCanExecute = () => {
        return appExecutor;
    };

    const verifyUserCanConfigure = () => {
        return appConfigurator;
    };

    const actions: TableAction<SynchronizationRule>[] = [
        {
            name: "details",
            text: i18n.t("Details"),
            multiple: false,
            primary: !appConfigurator,
        },
        {
            name: "edit",
            text: i18n.t("Edit"),
            multiple: false,
            isActive: verifyUserCanEdit,
            onClick: editRule,
            primary: appConfigurator,
            icon: <Icon>edit</Icon>,
        },
        {
            name: "delete",
            text: i18n.t("Delete"),
            multiple: true,
            isActive: verifyUserCanEdit,
            onClick: setToDelete,
            icon: <Icon>delete</Icon>,
        },
        {
            name: "execute",
            text: i18n.t("Execute"),
            multiple: false,
            isActive: verifyUserCanExecute,
            onClick: executeRule,
            icon: <Icon>settings_input_antenna</Icon>,
        },
        {
            name: "download",
            text: i18n.t("Download JSON"),
            multiple: false,
            onClick: downloadJSON,
            icon: <Icon>cloud_download</Icon>,
        },
        {
            name: "replicate",
            text: i18n.t("Replicate"),
            multiple: false,
            isActive: verifyUserCanConfigure,
            onClick: replicateRule,
            icon: <Icon>content_copy</Icon>,
        },
        {
            name: "toggleEnable",
            text: i18n.t("Toggle scheduling"),
            multiple: false,
            isActive: verifyUserCanEdit,
            onClick: toggleEnable,
            icon: <Icon>timer</Icon>,
        },
        {
            name: "sharingSettings",
            text: i18n.t("Sharing settings"),
            multiple: false,
            isActive: verifyUserCanEditSharingSettings,
            onClick: openSharingSettings,
            icon: <Icon>share</Icon>,
        },
    ];

    const onSearchRequest = async (key: string) =>
        api
            .get<SearchResult>("/sharing/search", { key })
            .getData();

    const onSharingChanged = async (updatedAttributes: ShareUpdate) => {
        if (!sharingSettingsObject) return;

        const newSharingSettings = {
            meta: sharingSettingsObject.meta,
            object: {
                ...sharingSettingsObject.object,
                ...updatedAttributes,
            },
        };

        const syncRule = SynchronizationRule.build(
            newSharingSettings.object as SynchronizationRuleData
        );
        await compositionRoot.rules.save(syncRule);

        setSharingSettingsObject(newSharingSettings);
    };

    const renderCustomFilters = (
        <React.Fragment key={"sync-rule-list-filters"}>
            <DatePicker
                key={"date-filter"}
                placeholder={i18n.t("Last executed date")}
                value={lastExecutedFilter}
                onChange={setLastExecutedFilter}
                isFilter
            />
            <Dropdown
                key={"target-instance-filter"}
                items={allInstances}
                onValueChange={setTargetInstanceFilter}
                value={targetInstanceFilter}
                label={i18n.t("Destination Instance")}
            />
            <Dropdown
                key={"enabled-filter"}
                items={enabledFilterData}
                onValueChange={setEnabledFilter}
                value={enabledFilter}
                label={i18n.t("Scheduling")}
            />
        </React.Fragment>
    );

    const handleTableChange = (tableState: TableState<ReferenceObject>) => {
        const { selection } = tableState;
        updateSelection(selection);
    };

    return (
        <TestWrapper>
            <PageHeader title={title} onBackClick={back} />
            <ObjectsTable<SynchronizationRule>
                rows={rows}
                columns={columns}
                details={details}
                actions={actions}
                selection={selection}
                onChange={handleTableChange}
                onActionButtonClick={appConfigurator ? createRule : undefined}
                filterComponents={renderCustomFilters}
                searchBoxLabel={i18n.t("Search by name")}
                onChangeSearch={setSearchFilter}
            />

            {toDelete.length > 0 && (
                <ConfirmationDialog
                    isOpen={true}
                    onSave={confirmDelete}
                    onCancel={() => setToDelete([])}
                    title={i18n.t("Delete Rules?")}
                    description={
                        toDelete
                            ? i18n.t("Are you sure you want to delete {{count}} rules?", {
                                  count: toDelete.length,
                              })
                            : ""
                    }
                    saveText={i18n.t("Ok")}
                />
            )}

            {!!syncReport && (
                <SyncSummary response={syncReport} onClose={() => setSyncReport(null)} />
            )}

            {!!sharingSettingsObject && (
                <SharingDialog
                    isOpen={true}
                    showOptions={{
                        title: false,
                        dataSharing: false,
                    }}
                    title={i18n.t("Sharing settings for {{name}}", sharingSettingsObject.object)}
                    meta={sharingSettingsObject}
                    onCancel={() => setSharingSettingsObject(null)}
                    onChange={onSharingChanged}
                    onSearch={onSearchRequest}
                />
            )}

            {!!pullRequestProps && (
                <PullRequestCreationDialog
                    {...pullRequestProps}
                    onClose={() => setPullRequestProps(undefined)}
                />
            )}

            {dialogProps && <ConfirmationDialog isOpen={true} maxWidth={"xl"} {...dialogProps} />}
        </TestWrapper>
    );
};

export default SyncRulesPage;
