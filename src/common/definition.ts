
export type ListView = {
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

export type xmllistView = {
  fullName: string;
  Columns: string[];
  filterScope: string;
}

export type filters = {
  field: string;
  operation: string;
  value: number;
}

