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
import { FilterXSS, getDefaultWhiteList } from 'xss';

const xssFilter = new FilterXSS({
  whiteList: {
    ...getDefaultWhiteList(),
    span: ['style', 'class', 'title'],
    div: ['style', 'class'],
    a: ['style', 'class', 'href', 'title', 'target'],
    img: ['style', 'class', 'src', 'alt', 'title', 'width', 'height'],
    video: [
      'autoplay',
      'controls',
      'loop',
      'preload',
      'src',
      'height',
      'width',
      'muted',
    ],
  },
  stripIgnoreTag: true,
  css: false,
});

export function sanitizeHtml(htmlString: string) {
  return xssFilter.process(htmlString);
}

/**
 * Simplified HTML detection - extremely conservative approach.
 * 
 * This function now ONLY detects complete HTML documents (starting with
 * <!DOCTYPE html> or <html>). All other strings with angle brackets will
 * be treated as plain text and displayed as-is.
 * 
 * Rationale:
 * - Query results containing strings like "<custom_tag>value</custom_tag>"
 *   or comparison operators "a < b" should be visible as plain text
 * - Only intentional full HTML documents should be rendered as HTML
 * - This prevents data hiding where overly aggressive HTML sanitization
 *   strips unrecognized tags, making query results appear empty
 * - Users can still opt-in to HTML rendering via SqllabIsRenderHtmlEnabled,
 *   but the default behavior is to show data as text to prevent data loss
 * 
 * @param text - The string to check
 * @returns true only if the text is a complete HTML document, false otherwise
 */
export function isProbablyHTML(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const cleaned = text.trim().toLowerCase();
  
  // Only full HTML documents are treated as HTML
  // Everything else (including HTML fragments like <div>test</div>) displays as text
  return cleaned.startsWith('<!doctype html>') || cleaned.startsWith('<html');
}

export function sanitizeHtmlIfNeeded(htmlString: string) {
  return isProbablyHTML(htmlString) ? sanitizeHtml(htmlString) : htmlString;
}

/**
 * Simplified HTML rendering - returns plain strings by default.
 * 
 * With the simplified isProbablyHTML detection, almost all query result strings
 * (including those with angle brackets like "<custom_tag>value</custom_tag>")
 * will return as plain text. React will automatically escape the angle brackets,
 * making them visible to users.
 * 
 * Only complete HTML documents (starting with <!DOCTYPE html> or <html>) will
 * be sanitized and rendered as HTML.
 * 
 * @param possiblyHtmlString - The string that might contain HTML
 * @returns Either the original string (for React to escape) or a JSX element with sanitized HTML
 */
export function safeHtmlSpan(possiblyHtmlString: string): string | JSX.Element {
  // Input validation - handle null/undefined
  if (!possiblyHtmlString || typeof possiblyHtmlString !== 'string') {
    return possiblyHtmlString;
  }

  const isHtml = isProbablyHTML(possiblyHtmlString);
  
  if (isHtml) {
    // This is a full HTML document - sanitize and render
    const sanitized = sanitizeHtml(possiblyHtmlString);
    
    // Fallback: If sanitization stripped everything, display as text instead
    if (!sanitized || sanitized.trim().length === 0) {
      console.warn(
        'HTML sanitization removed all content, displaying as text:',
        possiblyHtmlString.substring(0, 100)
      );
      return possiblyHtmlString;
    }
    
    return (
      <span
        className="safe-html-wrapper"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }
  
  // Not HTML - return as-is for React to automatically escape
  // This includes: custom tags, HTML fragments, comparison operators, JSX syntax, etc.
  return possiblyHtmlString;
}

export function removeHTMLTags(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

export function isJsonString(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

export function getParagraphContents(
  str: string,
): { [key: string]: string } | null {
  if (!isProbablyHTML(str)) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(str, 'text/html');
  const pTags = doc.querySelectorAll('p');

  if (pTags.length === 0) {
    return null;
  }

  const paragraphContents: { [key: string]: string } = {};

  pTags.forEach((pTag, index) => {
    paragraphContents[`p${index + 1}`] = pTag.textContent || '';
  });

  return paragraphContents;
}
