"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterBuilder = exports.EntityFilter = void 0;
class EntityFilter {
    constructor() {
        this.requests = [];
    }
    present() {
        return this.requests.length > 0;
    }
    match(obj) {
        let relations;
        for (let req of this.requests) {
            if (req.filter.match(obj)) {
                relations = this.mergeRelations(relations, req.relations);
            }
        }
        return relations;
    }
    mergeRelations(a, b) {
        if (a == null)
            return b;
        let result = { ...a };
        let key;
        for (key in b) {
            if (b[key]) {
                result[key] = b[key];
            }
        }
        return result;
    }
    add(filter, relations) {
        if (filter instanceof FilterBuilder) {
            if (filter.isNever())
                return;
            filter = filter.build();
        }
        this.requests.push({
            filter,
            relations
        });
    }
}
exports.EntityFilter = EntityFilter;
class FilterBuilder {
    constructor() {
        this.filters = [];
        this.never = false;
    }
    propIn(prop, values) {
        if (values == null)
            return this;
        if (values.length == 0) {
            this.never = true;
        }
        let filter = values.length == 1
            ? new PropEqFilter(prop, values[0])
            : new PropInFilter(prop, values);
        this.filters.push(filter);
        return this;
    }
    getIn(get, values) {
        if (values == null)
            return this;
        if (values.length == 0) {
            this.never = true;
        }
        let filter = values.length == 1
            ? new GetEqFilter(get, values[0])
            : new GetInFilter(get, values);
        this.filters.push(filter);
        return this;
    }
    matchAny(test, values) {
        if (values == null)
            return this;
        if (values.length == 0) {
            this.never = true;
        }
        this.filters.push(new MatchAnyFilter(test, values));
        return this;
    }
    isNever() {
        return this.never;
    }
    build() {
        switch (this.filters.length) {
            case 0: return OK;
            case 1: return this.filters[0];
            default: return new AndFilter(this.filters);
        }
    }
}
exports.FilterBuilder = FilterBuilder;
const OK = {
    match(obj) {
        return true;
    }
};
class PropInFilter {
    constructor(prop, values) {
        this.prop = prop;
        this.values = new Set(values);
    }
    match(obj) {
        return this.values.has(obj[this.prop]);
    }
}
class PropEqFilter {
    constructor(prop, value) {
        this.prop = prop;
        this.value = value;
    }
    match(obj) {
        return obj[this.prop] === this.value;
    }
}
class GetInFilter {
    constructor(get, values) {
        this.get = get;
        this.values = new Set(values);
    }
    match(obj) {
        return this.values.has(this.get(obj));
    }
}
class GetEqFilter {
    constructor(get, value) {
        this.get = get;
        this.value = value;
    }
    match(obj) {
        return this.get(obj) === this.value;
    }
}
class MatchAnyFilter {
    constructor(test, values) {
        this.test = test;
        this.values = values;
    }
    match(obj) {
        for (let i = 0; i < this.values.length; i++) {
            if (this.test(obj, this.values[i]))
                return true;
        }
        return false;
    }
}
class AndFilter {
    constructor(filters) {
        this.filters = filters;
    }
    match(obj) {
        for (let f of this.filters) {
            if (!f.match(obj))
                return false;
        }
        return true;
    }
}
//# sourceMappingURL=filter.js.map