import React from "react";
import PropTypes from "prop-types";
import i18n from "@dhis2/d2-i18n";
import { Select, MenuItem, FormControl, InputLabel } from "@material-ui/core";
import { MuiThemeProvider, createMuiTheme } from "@material-ui/core";
import cyan from "@material-ui/core/colors/cyan";

const getMaterialTheme = () =>
    createMuiTheme({
        typography: {
            useNextVariants: true,
        },
        overrides: {
            MuiFormLabel: {
                root: {
                    color: "#aaaaaa",
                    "&$focused": {
                        color: "#aaaaaa",
                    },
                    top: "-9px !important",
                    marginLeft: 10,
                },
            },
            MuiInput: {
                root: {
                    marginLeft: 10,
                },
                formControl: {
                    minWidth: 250,
                    marginTop: "8px !important",
                },
                input: {
                    color: "#565656",
                },
                underline: {
                    "&&&&:hover:before": {
                        borderBottom: `1px solid #bdbdbd`,
                    },
                    "&:hover:not($disabled):before": {
                        borderBottom: `1px solid #aaaaaa`,
                    },
                    "&:after": {
                        borderBottom: `2px solid ${cyan["500"]}`,
                    },
                    "&:before": {
                        borderBottom: `1px solid #bdbdbd`,
                    },
                },
            },
        },
    });

export default function Dropdown({ items, value, onChange, label }) {
    const materialTheme = getMaterialTheme();
    return (
        <MuiThemeProvider theme={materialTheme}>
            <FormControl>
                <InputLabel>{label}</InputLabel>
                <Select value={value} onChange={onChange}>
                    <MenuItem value={""}>{i18n.t("<No value>")}</MenuItem>
                    {items.map(i => (
                        <MenuItem key={i.id} value={i.id}>
                            {i.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </MuiThemeProvider>
    );
}

Dropdown.propTypes = {
    items: PropTypes.array.isRequired,
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string.isRequired,
};
