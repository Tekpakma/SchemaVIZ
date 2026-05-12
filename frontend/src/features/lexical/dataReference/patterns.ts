import { regex } from 'arkregex'

export const TEMPLATE_PATTERN = regex('{{(?<fieldName>[^{}]+)}}')
export const TEMPLATE_PATTERN_GLOBAL = regex('{{(?<fieldName>[^{}]+)}}', 'g')
