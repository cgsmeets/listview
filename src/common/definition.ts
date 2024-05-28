
export type listView = {
  columns:         Column[];
  id:              string;
  orderBy:         OrderBy[];
  query:           string;
  relatedEntityId: null;
  scope:           string;
  scopeEntityId:   null;
  sobjectType:     string;
  whereCondition:  WhereCondition;
}

export type Column = {
  ascendingLabel:  null | string;
  descendingLabel: null | string;
  fieldNameOrPath: string;
  hidden:          boolean;
  label:           string;
  searchable:      boolean;
  selectListItem:  string;
  sortDirection:   null | string;
  sortIndex:       number | null;
  sortable:        boolean;
  type:            string;
}

export type OrderBy = {
  fieldNameOrPath: string;
  nullsPosition:   string;
  sortDirection:   string;
}

export type WhereCondition = {
  conditions:  WhereConditionCondition[];
  conjunction: string;
}

export type WhereConditionCondition = {
  field?:       string;
  operator?:    string;
  values?:      string[];
  conditions?:  ConditionCondition[];
  conjunction?: string;
}

export type ConditionCondition = {
  field:    string;
  operator: string;
  values:   string[];
}

export type XmllistView = {
  ListView: ListView;
}
export type Package = {
  Package?: PackageClass;
}

export type PackageClass = {
  types:   Types;
  version: string;
}

export type Types = {
  members: string[];
  name:    string;
}

export type ListView = {
  fullName:      string;
  booleanFilter?: string;
  columns:       string[];
  filterScope:   string;
  filters?:       Filter[];
  label:         string;
}

export type Filter = {
  field:     string;
  operation: string;
  value:     string;
}

// ### Salesforce Custom Oject standard fields
export type SObject = {
  attributes?: attributes;
  Id?: string;
  Name?: string;
  createddate?: number;
  createdby?: string;
  last_modifiedbydate?: number;
  last_modifiedby?: string;
  RecordTypeId?: string;
}

// ### API query response standard fields
type attributes = {
  type: string;
  url: string;
}

// tslint:disable-next-line: class-name
export type SUser = {
  Username: string;
} & SObject

export type SListView = {
  DeveloperName: string;
  SobjectType: string;
} & SObject
