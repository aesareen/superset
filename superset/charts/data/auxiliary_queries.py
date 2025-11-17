# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Auxiliary query builder for percentage calculations.

This module provides utilities to build auxiliary queries that fetch
grand totals from the entire dataset for percentage metric calculations.
"""
from __future__ import annotations

import copy
import logging
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from superset.common.query_object import QueryObject
    from superset.connectors.sqla.models import BaseDatasource

logger = logging.getLogger(__name__)


class AuxiliaryQueryBuilder:
    """Builds auxiliary queries for percentage calculations."""

    @staticmethod
    def should_build_auxiliary_query(
        query_object: QueryObject,
        form_data: dict[str, Any] | None,
    ) -> bool:
        """
        Determine if an auxiliary query should be built.

        Args:
            query_object: The main query object
            form_data: Form data containing chart configuration

        Returns:
            True if auxiliary query is needed, False otherwise
        """
        if not form_data:
            return False

        # Check if there are percentage metrics configured
        percent_metrics = form_data.get("percent_metrics", [])
        
        # Only build auxiliary query if:
        # 1. There are percentage metrics
        # 2. There's a row limit (otherwise percentages are already correct)
        # 3. There's a groupby (aggregate mode)
        has_percent_metrics = bool(percent_metrics)
        has_row_limit = query_object.row_limit and query_object.row_limit > 0
        has_groupby = bool(query_object.columns)

        return has_percent_metrics and has_row_limit and has_groupby

    @staticmethod
    def build_totals_query_object(
        query_object: QueryObject,
    ) -> dict[str, Any]:
        """
        Build a query object to fetch grand totals for percentage calculations.

        This creates a modified query that:
        - Removes row_limit to fetch all records
        - Removes order_by since we're just aggregating
        - Removes groupby columns to get grand totals
        - Keeps only the metrics (aggregations)
        - Preserves all filters to ensure same data scope

        Args:
            query_object: The main query object

        Returns:
            Dictionary representing the totals query object
        """
        # Convert query object to dict and make a deep copy
        query_dict = query_object.to_dict()
        totals_query_dict = copy.deepcopy(query_dict)

        # Remove row limit and order by
        totals_query_dict["row_limit"] = None
        totals_query_dict["row_offset"] = None
        totals_query_dict["orderby"] = []

        # Remove groupby columns (we want grand totals, not grouped)
        totals_query_dict["columns"] = []
        totals_query_dict["groupby"] = []
        
        # Keep series_columns empty for grand total
        totals_query_dict["series_columns"] = []

        # Set is_timeseries to False (no time-based grouping for totals)
        totals_query_dict["is_timeseries"] = False

        # Remove ALL fields that aren't valid SQL query parameters
        # These fields are added by QueryObject or form_data but not accepted by get_sqla_query()
        fields_to_remove = [
            # Post-processing and result formatting (not SQL params)
            "post_processing",
            "result_type",
            "result_format",
            
            # Time-related fields that aren't valid for get_sqla_query
            "time_offsets",
            "time_grain_sqla",  # Causes TypeError
            "time_grain",       # May also cause issues
            
            # Internal QueryObject fields not used in SQL generation
            "applied_time_extras",
            "inner_from_dttm",
            "inner_to_dttm",
            
            # Row count query flag (not needed for totals)
            "is_rowcount",
            
            # Annotation layers (not needed for totals)
            "annotation_layers",
            
            # Custom fields we added
            "auxiliary_totals",
        ]
        
        for field in fields_to_remove:
            totals_query_dict.pop(field, None)
        
        # Also check and clean the extras dict if it exists
        if "extras" in totals_query_dict and isinstance(totals_query_dict["extras"], dict):
            extras_to_remove = ["time_grain_sqla", "time_grain"]
            for field in extras_to_remove:
                totals_query_dict["extras"].pop(field, None)

        logger.debug(
            "Built auxiliary totals query object: %s metrics, no row_limit, no groupby",
            len(totals_query_dict.get("metrics", []))
        )

        return totals_query_dict

    @staticmethod
    def execute_totals_query(
        datasource: BaseDatasource,
        totals_query_dict: dict[str, Any],
    ) -> dict[str, float] | None:
        """
        Execute the totals query and extract grand totals.

        Args:
            datasource: The datasource to query
            totals_query_dict: Query object dict for fetching totals

        Returns:
            Dictionary mapping metric labels to their grand totals,
            or None if query fails
        """
        try:
            # Execute the query through the datasource
            result = datasource.query(totals_query_dict)

            if result.df.empty:
                logger.warning("Auxiliary totals query returned empty result")
                return None

            # Extract the first (and should be only) row which contains totals
            totals_row = result.df.iloc[0]
            
            # Convert to dictionary of metric_label -> total_value
            totals = totals_row.to_dict()

            logger.info(
                "Successfully fetched auxiliary totals: %s metrics",
                len(totals)
            )

            return totals

        except Exception as ex:  # pylint: disable=broad-except
            logger.warning(
                "Failed to execute auxiliary totals query: %s. "
                "Falling back to row_limit mode.",
                str(ex),
                exc_info=True
            )
            return None

