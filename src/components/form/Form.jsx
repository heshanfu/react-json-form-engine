import React from 'react';
import PropTypes from 'prop-types';
import _isEmpty from 'lodash/isEmpty';
import { Tabs, Tab } from 'react-tabify';

import Asterisk from '../common/Asterisk';
import FormSubmitButton from './helpers/FormSubmitButton';
import ValidationAPIError from './validation/ValidationAPIError';
import FormSection from './FormSection';
import FormTitle from './helpers/FormTitle';
import { Flex } from '../common';

class Form extends React.Component {
    constructor(props) {
        super(props);
        this.onUpdate = this.onUpdate.bind(this);
        this._renderSectionTabPane = this._renderSectionTabPane.bind(this);
    }

    componentDidMount() {
        const { instance } = this.props;
        if (instance.isValid()) {
            instance.validate();
        }
    }

    render() {
        const { instance } = this.props;
        // No instance
        if (!instance || _isEmpty(instance)) {
            return <em className="has-text-danger">No form instance</em>;
        }
        // Invalid definition
        if (!instance.isValid()) {
            return <ValidationAPIError error={instance.error} />;
        }
        // No sections
        if (instance.getSections().isEmpty()) {
            return <em className="has-text-danger">No sections</em>;
        }

        return (
            <Flex
                width={this.props.width || 500}
                id={`form-${instance.getId()}`}
                column
                flex={1}
                flexShrink={0}
                border="1px solid #dbdbdb"
                overflow="auto"
            >
                {this._renderFormTitle(instance)}
                {this._renderForm(instance.getSections())}
            </Flex>
        );
    }

    _renderFormTitle(instance) {
        if (!this.props.hideTitle) {
            return (
                <FormTitle
                    id={`form-title-${instance.getId()}`}
                    iconPrefix={instance.getFormIconPrefix()}
                    icon={instance.getFormIcon()}
                    label={instance.getFormTitle()}
                    controlsRight={this._renderSubmitButton()}
                />
            );
        }
    }

    _renderForm(sections) {
        return sections.count() > 1
            ? this._renderTabbedSections(sections)
            : this._renderSingleSection(sections.values()[0]);
    }

    _renderTabbedSections(sections) {
        return (
            <Tabs stacked id={`form-tabs-${this.props.instance.getId()}`} defaultActiveKey={0}>
                {this._renderSectionContent(sections)}
            </Tabs>
        );
    }

    _renderSectionContent(sections) {
        return sections.values().map(this._renderSectionTabPane);
    }

    _renderSectionTabPane(section, index) {
        return (
            <Tab key={index} eventKey={index} label={this._getDerivedSectionTitle(section)}>
                {this._renderSingleSection(section)}
            </Tab>
        );
    }

    _renderSingleSection(section) {
        return (
            <FormSection
                section={section}
                instance={this.props.instance}
                onUpdate={this.onUpdate}
                hideTitle={this.props.hideSectionTitles}
                hideSubtitle={this.props.hideSubsectionTitles}
                submitButton={this.props.hideTitle ? this._renderSubmitButton() : null}
            />
        );
    }

    _getDerivedSectionTitle(section) {
        let label = section.title;
        if (this.props.instance.sectionHasError(section)) {
            label = (
                <span>
                    {label} <Asterisk />
                </span>
            );
        }
        return label;
    }

    _renderSubmitButton() {
        return <FormSubmitButton onSubmit={this.props.onSubmit} label={this.props.submitButtonLabel} />;
    }

    onUpdate(event, id) {
        const { instance, onUpdate } = this.props;

        id = id || event.target.id;
        const field = instance.getField(id);

        const value = field.actions.onUpdate(event, field, instance.getModelValue(id));

        instance.setModelValue(id, value, field); // Set model value

        if (instance.isLiveValidation()) {
            instance.validate(); // Validate the form
        }

        if (!onUpdate) {
            this.forceUpdate();
        } else {
            onUpdate({ id, value }); // Notify parent
        }
    }
}

Form.propTypes = {
    instance: PropTypes.object.isRequired,
    submitButtonLabel: PropTypes.string,
    hideTitle: PropTypes.bool,
    hideSectionTitles: PropTypes.bool,
    hideSubsectionTitles: PropTypes.bool,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onSubmit: PropTypes.func.isRequired,
    onUpdate: PropTypes.func
};

export default Form;
