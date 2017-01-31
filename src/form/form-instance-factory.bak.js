import FormConfig from './config/form-config';
import ExpressionService from './services/expression-service';
import ValidationResults from './validation/validation-results';
import ValidationService from './service/validation-service';
import FormValidator from './validation/form-validator';
import VALIDATION_CONST from './validation/validation-const';
import { hasValue, __blank } from '../common/common';
import { DATA_TYPE } from './config/form-const';
import _ from 'lodash';

class Form {
    constructor (definition, model, validator) {
        // Check for valid definition
        if (!hasValue(definition) || _.isEmpty(definition)) {
            throw new Error('Form definition cannot be null/undefined/empty');
        }

        this.definition = definition;   // Form definition
        this.model = model;             // Map of form responses keyed by tag

        // Check for valid schemas
        const { schema } = definition;
        if (!hasValue(schema) || _.isEmpty(schema)) {
            throw new Error('Schema cannot cannot be null/undefined/empty');
        }

        // Instance data
        this.sections = [];             // List of form sections. Holds subsections and fields.
        this.fields = {};               // Map of fields keyed by tag. Entry contains field metadata
        this.validationResults = {};    // Class that holds form validation results
        this.validator = {};            // Form validator service

        this.__initInstance(validator);
    }

    /**
     * Initialize the form instance
     * @param validator
     * @private
     */
    __initInstance (validator) {
        const instance = this;

        // Register field info with the form instance
        instance.__initFields();

        // Register validation services
        instance.validator = validator || FormValidator;
        instance.validationResults = new ValidationResults();

        // Validate
        instance.validate();
        console.log(instance);
    }

    /**
     * Apply metadata to each field in the form definition, such as the
     * React component to render in the UI, and any related information
     * in the uiSchema.
     * @private
     */
    __initFields () {
        /**
         * Don't modify the original form definition
         *
         * Instead, make a copy of the schema (sections) and apply all instance
         * metadata to the copy. This is necessary if we want to have
         * two separate instances of the same form definition active at the
         * same time.
         */
        this.sections = JSON.parse(
            JSON.stringify(_.sortBy(this.getSchema().sections, 'sortOrder'))
        );

        //  Register field info
        _.forEach(this.sections, section => {
            _.forEach(section.subsections, subsection => {
                _.forEach(subsection.fields, (field, tag) => {
                    this.__decorateField(field, tag);
                });
            });
        });
    }
    __decorateField (field, tag, formComponentKey) {
        if (this.fields[tag]) throw new Error(`Field with tag "${tag}" already exists. Tag must be unique.`);
        if (!field.type) throw new Error('field must contain a valid "type" property');

        // Obtain uiField definition
        field.uiField = formComponentKey
            ? this.__addComponentToUiSchemaAndReturnUiField(tag, formComponentKey)
            : this.getUiSchemaField(tag) || {};

        // Obtain field component type
        field.componentType = FormConfig.getComponentTypeByField(field, field.uiField);

        // Set the form component
        field.component = FormConfig.getComponentConfig(field.type, field.componentType);

        // Add RegExp if specified
        if (_.isString(field.pattern)) {
            field.pattern = new RegExp(field.pattern);
        }

        // Build field children
        if (field.fields) {
            field.fields = this.__decorateChildren(field, field.fields);
        }

        // Build children of options
        if (field.options) {
            _.forEach(field.options, option => {
                option.parent = field;
                if (option.fields) {
                    option.fields = this.__decorateChildren(option, option.fields);
                }
            });
        }

        this.fields[tag] = field;
    }
    __decorateChildren (parent, children) {
        const childFields = {};
        _.forEach(children, (child, tag) => {
            this.__decorateField(child, tag);
            child.parent = parent;
            childFields[tag] = child;
        });
        return childFields;
    }
    /**
     * Add the field to the UI schema.
     *
     * For most fields, the UI schema typically already contains. However when we
     * convert goal & task metadata into form fields, we need to add
     * UI definitions for checkbox groups.
     *
     * The translation process could take care of this, however, by letting the instance
     * factory determine what form control is built, it grants us greater flexibility.
     * @param tag
     * @param type
     * @returns {{component: {type: *}}}
     * @private
     */
    __addComponentToUiSchemaAndReturnUiField (tag, type) {
        let uiField = this.definition.uiSchema[tag];
        if (!uiField) {
            uiField = {};
            this.definition.uiSchema[tag] = uiField;
        }
        uiField.component = { type };
        return uiField;
    }
    __clearOptionChildren (options, value) {
        _.forEach(options, option => {
            if (option.fields && !_.includes(value, option.id.toString())) {
                this.__clearFields(option.fields);
            }
        });
    }
    __clearFields (fields) {
        _.forEach(fields, (field, tag) => {
            if (hasValue(this.getModelValue(tag))) {
                this.setModelValue(tag, undefined, field);
            }
        });
    }
    getField (tag) {
        return this.fields[tag];
    }
    evaluateShowCondition (field, tag) {
        if (!field.showCondition) return true;
        const showField = ExpressionService.evalCondition(field.showCondition, this);
        if (!showField) {
            // Clear non-child fields that are conditionally hidden
            if (!__blank(this.getModelValue(tag))) {
                this.setModelValue(tag, undefined, field);
            }
        }
        return showField;
    }
    getModel () {
        return this.model;
    }
    getModelValue (tag) {
        return this.model[tag] ? this.model[tag].value : this.model[tag];
    }
    setModelValue (tag, value, field) {
        // Set the model value accordingly, update the dirty flag
        if (value === undefined) {
            delete this.model[tag];
            field.dirty = false;
        } else {
            const modelValue = {
                value: value
            };
            if (field.definition) {
                modelValue.fieldType = field.definition.type;
                modelValue.definitionId = field.definition.definitionId;
            }
            this.model[tag] = modelValue;
            field.dirty = true;
        }

        // Clear option children
        if (field.options) {
            this.__clearOptionChildren(field.options, value);
        }

        // Clear child fields
        if (field.fields) {
            switch (field.type) {
                case DATA_TYPE.BOOLEAN: {
                    if (value === false) {
                        this.__clearFields(field.fields);
                    }
                    break;
                }
                case DATA_TYPE.NUMBER: {
                    if (Number.isNaN(value)) {
                        this.__clearFields(field.fields);
                    }
                    break;
                }
                case DATA_TYPE.ARRAY: {
                    if (_.isEmpty(value)) {
                        this.__clearFields(field.fields);
                    }
                    break;
                }
                case DATA_TYPE.DATE:
                case DATA_TYPE.STRING:
                default: {
                    if (__blank(value)) {
                        this.__clearFields(field.fields);
                    }
                    break;
                }
            }
        }
    }
    calculateFields (field) {
        if (field.calc) {
            // Recalculate list of tags
            // TODO: Why do we need id here? Use tag?
            const tagList = this.getCalcTriggerMap()[field.id];
            _.forEach(tagList, tag => {
                // Get a list of expressions to evaluate that will determine the value of tag
                const expression = this.getCalcExpressionByTag(tag);
                if (expression) {
                    const value = ExpressionService.evalExpression(expression, this);
                    this.setModelValue(tag, value, this.getField(tag));
                    this.triggerDefaultValueEvaluation(tag);
                }
            });
        }
    }
    // Evaluate default values
    triggerDefaultValueEvaluation (tag) {
        const tagsToEvaluate = this.getDefaultValueTriggerMap()[tag];
        if (tagsToEvaluate) {
            this.evaluateDefaultValueConditions(tagsToEvaluate);
        }
    }
    evaluateDefaultValueConditions (tags) {
        _.forEach(tags, tag => {
            const field = this.getField(tag);

            // Generate a flat array of default value conditions from an arbitrary number of options
            const defaultValueConditions = field.defaultValueConditions || _.flatten(
                _.map(field.options, option => option.defaultValueConditions)
            );

            _.forEach(defaultValueConditions, conditionalExpression => {
                const conditionMet = ExpressionService.evalCondition(conditionalExpression.condition, this);
                if (conditionMet) {
                    // Evaluate the expression to obtain the default value
                    let defaultValue = ExpressionService.evalExpression(conditionalExpression.expression, this);

                    if (field.type === DATA_TYPE.ARRAY) {
                        // Pass the value through the applicable "onUpdate" method to
                        // mimic an update from the UI. This is important since it will
                        // concatenate or pop array values for checkbox groups and selects
                        defaultValue = field.component.onUpdate(event, field, this.getModelValue(tag), defaultValue);
                    }

                    // Update the model value
                    this.setModelValue(tag, defaultValue, field);
                }
            });
        });
    }
    getSchema () {
        return this.definition.schema;
    }
    getUiSchema () {
        return this.definition.uiSchema || {};
    }
    /**
     * CalcExpressionMap is a map of objects keyed by tag.
     * Each entry contains a "type" and an "expression"
     * property, where "type" is a String that determines the
     * type of calc expression, and "expression" is an array
     * of expressions to be evaluated for the keyed tag.
     *
     * It it assumed all expressions in the array are included
     * in the same calculation.
     *
     * Example entry:
     *
     *      "totalScore":{
     *         "type":"ADD"
     *         "expressions":[
     *            {
     *               "type":"FORM_RESPONSE",
     *               "tag":"ageGroup"
     *            },
     *            {
     *               "type":"FORM_RESPONSE",
     *               "tag":"gender"
     *            },
     *            {
     *               "type":"FORM_RESPONSE",
     *               "tag":"liveCaregiver"
     *            }
     *         ]
     *      }
     *
     *  The expressions above are added together ("ADD")
     *  to resolve the value for tag "totalScore"
     *
     * @returns {calcExpressionMap|{}}
     */
    getCalcExpressionMap () {
        return this.definition.calcExpressionMap;
    }
    /**
     * Map of tags keyed by field id. Each entry is an array of tags
     * that require calculation when the value of the field associated
     * with the field id changes. When we detect a change on a calc field,
     * we use it's id to lookup which tags must be recalculated. Using these
     * tags, we do a lookup in "calcExpressionMap" for the expressions
     * we must run for the tag in question.
     *
     * Example entries:
     *    {
     *      "0e25b3f7-74d5-46ce-b4d6-73d00c6a09af": ["totalScore"],
     *      "a48a2ea2-4ac1-48a2-8622-1fe03a5b496f": ["totalScore"],
     *      "cd8a345a-0d74-4d55-a795-eb9dac622fee": ["totalScore"],
     *    }
     *
     * The exported spreadsheets do not utilize this behavior to its full potential,
     * however this design allows us to evaluate the expressions of multiple tags
     * given that only a single field value changed.
     *
     * @returns {calcTriggerMap|{}}
     */
    getCalcTriggerMap () {
        return this.definition.calcTriggerMap;
    }
    /**
     * Map of fields to evaluate the default value of when the key's value changes.
     * For instance, when the model value of "totalScore" changes, we must run the
     * default value conditions for "totalScoreRadio". These conditions live on
     * the field object as 'defaultValueConditions'
     *
     * Example entries:
     *    {
     *       "totalScore": ["totalScoreRadio"]
     *    }
     *
     * @returns {defaultValueTriggerMap|{}}
     */
    getDefaultValueTriggerMap () {
        return this.definition.defaultValueTriggerMap;
    }
    getCalcExpressionByTag (tag) {
        if (this.getCalcExpressionMap()) {
            return this.getCalcExpressionMap()[tag];
        }
    }
    getSections () {
        return this.sections;
    }
    getUiSchemaField (tag) {
        return this.getUiSchema()[tag];
    }
    hasValidator () {
        return hasValue(this.validator);
    }
    validate () {
        if (this.hasValidator()) {
            this.validationResults.clear();
            this.validator.validate(this, this.validationResults);
            this.validationResults.postProcess();
        }
    }
    getValidationResults () {
        return this.validationResults;
    }
    getValidationResultByTag (tag) {
        return this.validationResults.getResults(tag);
    }
    getValidationStatusByTag (tag) {
        return this.getValidationResultByTag(tag).status;
    }
    hasError (tag) {
        return !tag
            ? this.validationResults.hasError()                     // Return overall validation status
            : this.isError(this.getValidationStatusByTag(tag));     // Return validation status of given tag
    }
    isError (status) {
        return ValidationService.isError(status);
    }
    getStatus (iterator, getStatus, useTag) {
        let status = VALIDATION_CONST.STATUS.OK;
        _.forEach(iterator, (i, tag) => {
            const iStatus = getStatus(useTag ? tag : i);
            if (ValidationService.isMoreSevereStatus(iStatus, status)) {
                status = iStatus;
            }
        });
        return status;
    }
    getSubsectionStatus (subsection) {
        return this.getStatus(
            subsection.fields,
            this.getValidationStatusByTag.bind(this),
            true
        );
    }
    getSectionStatus (section) {
        return this.getStatus(
            section.subsections,
            this.getSubsectionStatus.bind(this)
        );
    }
}

function FormInstanceFactory (definition, model, validator) {
    return new Form(definition, model, validator);
}

export default FormInstanceFactory;