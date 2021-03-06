import React from 'react';
import PropTypes from 'prop-types';
import Maybe from 'maybe-baby';

import { Asterisk } from '../../common';

export default function FormItemTitle({ field, decorators, instance }) {
    if (__noTitle(decorators)) return null;
    return (
        <div className="label" htmlFor={field.id}>
            {field.title}&nbsp;
            {__maybeRenderError(field, instance)}
        </div>
    );
}

function __maybeRenderError(field, instance) {
    if (instance.fieldHasError(field.id)) {
        return <Asterisk />;
    }
}

function __noTitle(decorators) {
    return Maybe.of(decorators)
        .prop('hideControlLabel')
        .isJust();
}

FormItemTitle.propTypes = {
    field: PropTypes.object.isRequired,
    instance: PropTypes.object.isRequired,
    decorators: PropTypes.object
};
