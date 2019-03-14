import React from "react";
import PropTypes from "prop-types";
import i18n from "@dhis2/d2-i18n";
import { DialogHandler } from "d2-ui-components";

import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import Icon from "@material-ui/core/Icon";

const iconStyle = { paddingTop: 10, marginBottom: 5 };

const renderHelpButton = helpText => {
    const Button = ({ onClick }) => (
        <IconButton tooltip={i18n.t("Help")} onClick={onClick} style={{ marginBottom: 8 }}>
            <Icon color="primary">help</Icon>
        </IconButton>
    );

    return <DialogHandler buttonComponent={Button} title={i18n.t("Help")} contents={helpText} />;
};

function PageHeader({ variant, title, onBackClick, helpText }) {
    return (
        <div>
            <IconButton
                onClick={onBackClick}
                color="secondary"
                aria-label={i18n.t("Back")}
                style={iconStyle}
            >
                <Icon color="primary">arrow_back</Icon>
            </IconButton>

            <Typography
                variant={variant}
                gutterBottom
                style={{ display: "inline-block", fontWeight: 300 }}
            >
                {title}
            </Typography>
            {helpText && renderHelpButton(helpText)}
        </div>
    );
}

PageHeader.propTypes = {
    variant: PropTypes.string,
    title: PropTypes.string.isRequired,
    onBackClick: PropTypes.func.isRequired,
    helpText: PropTypes.string,
};

PageHeader.defaultProps = {
    variant: "h5",
    helpButton: null,
};

export default PageHeader;
