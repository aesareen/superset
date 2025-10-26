/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { JsonModal, safeJsonObjectParse } from 'src/components/JsonModal';
import { t, safeHtmlSpan } from '@superset-ui/core';
import { NULL_STRING, CellDataType } from './useCellContentParser';

type CellParams = {
  cellData: CellDataType;
  columnKey: string;
};

type Params = CellParams & {
  allowHTML?: boolean;
  getCellContent?: (args: CellParams) => string;
};

/**
 * Renders a cell in the SQL Lab results table.
 * 
 * With the simplified HTML detection approach:
 * - Strings with angle brackets (like "<custom_tag>value</custom_tag>") display as plain text
 * - Only complete HTML documents (starting with <!DOCTYPE html> or <html>) render as HTML
 * - This prevents data hiding where query results appear empty due to overly aggressive sanitization
 * 
 * @param cellData - The data to render in the cell
 * @param getCellContent - Optional function to transform cell content
 * @param columnKey - The column identifier
 * @param allowHTML - Whether to allow HTML rendering (default: true)
 */
export const renderResultCell = ({
  cellData,
  getCellContent,
  columnKey,
  allowHTML = true,
}: Params) => {
  const cellNode =
    getCellContent?.({ cellData, columnKey }) ?? String(cellData);
  if (cellData === null) {
    return <i className="text-muted">{NULL_STRING}</i>;
  }
  const jsonObject = safeJsonObjectParse(cellData);
  if (jsonObject) {
    return (
      <JsonModal
        modalTitle={t('Cell content')}
        jsonObject={jsonObject}
        jsonValue={cellData}
      />
    );
  }
  // When allowHTML is true, safeHtmlSpan will:
  // - Return strings as-is for React to escape (most cases)
  // - Only render complete HTML documents as HTML
  if (allowHTML && typeof cellData === 'string') {
    return safeHtmlSpan(cellNode);
  }
  return cellNode;
};
