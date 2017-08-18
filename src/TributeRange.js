// Thanks to https://github.com/jeff-collins/ment.io
class TributeRange {
    constructor(tribute) {
        this.tribute = tribute
        this.tribute.range = this
    }

    getWindow(ctx) {
        if (ctx.element) {
            var doc = ctx.element.ownerDocument;
            var win = doc.defaultView || doc.parentWindow;

            // the element is not in the same window
            if (win !== window.self) {
                return win
            } else {
                return window
            }
        }

        return window
    }

    getDocument(ctx) {
        return this.getWindow(ctx).document;
    }

    getWindowSelection(ctx) {
        return this.getWindow(ctx).getSelection();
    }

    positionMenuAtCaret(scrollTo) {
        let context = this.tribute.current,
            coordinates

        let info = this.getTriggerInfo(false, false, true, this.tribute.allowSpaces)

        if (typeof info !== 'undefined') {
            if (!this.isContentEditable(context.element)) {
                coordinates = this.getTextAreaOrInputUnderlinePosition(this.getDocument(context).activeElement,
                    info.mentionPosition)
            }
            else {
                coordinates = this.getContentEditableCaretPosition(info.mentionPosition)
            }

            setTimeout(() => {
                this.tribute.menu.style.cssText = `top: ${coordinates.top}px;
                                         left: ${coordinates.left}px;
                                         position: absolute;
                                         zIndex: 10000;
                                         display: block;`

                if (scrollTo) this.scrollIntoView(this.getDocument(context).activeElement)
            }, 0)
        } else {
            this.tribute.menu.style.cssText = 'display: none'
        }
    }

    selectElement(targetElement, path, offset) {
        let range
        let elem = targetElement

        if (path) {
            for (var i = 0; i < path.length; i++) {
                elem = elem.childNodes[path[i]]
                if (elem === undefined) {
                    return
                }
                while (elem.length < offset) {
                    offset -= elem.length
                    elem = elem.nextSibling
                }
                if (elem.childNodes.length === 0 && !elem.length) {
                    elem = elem.previousSibling
                }
            }
        }
        let sel = this.getWindowSelection(this.tribute.current)

        range = this.getDocument(this.tribute.current).createRange()
        range.setStart(elem, offset)
        range.setEnd(elem, offset)
        range.collapse(true)

        try {
            sel.removeAllRanges()
        } catch (error) {}

        sel.addRange(range)
        targetElement.focus()
    }

    // TODO: this may not be necessary anymore as we are using mouseup instead of click
    resetSelection(targetElement, path, offset) {
        if (!this.isContentEditable(targetElement)) {
            if (targetElement !== this.getDocument(this.tribute.current).activeElement) {
                targetElement.focus()
            }
        } else {
            this.selectElement(targetElement, path, offset)
        }
    }

    replaceTriggerText(text, requireLeadingSpace, hasTrailingSpace, originalEvent, item) {
        let context = this.tribute.current
        // TODO: this may not be necessary anymore as we are using mouseup instead of click
        // this.resetSelection(context.element, context.selectedPath, context.selectedOffset)

        let info = this.getTriggerInfo(true, hasTrailingSpace, requireLeadingSpace, this.tribute.allowSpaces)

        // Create the event
        let replaceEvent = new CustomEvent('tribute-replaced', {
            detail: {
                item: item,
                event: originalEvent
            }
        })

        if (info !== undefined) {
            if (!this.isContentEditable(context.element)) {
                let myField = this.getDocument(context).activeElement
                let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                    ? this.tribute.replaceTextSuffix
                    : ' '
                text += textSuffix
                let startPos = info.mentionPosition
                let endPos = info.mentionPosition + info.mentionText.length + textSuffix.length
                myField.value = myField.value.substring(0, startPos) + text +
                    myField.value.substring(endPos, myField.value.length)
                myField.selectionStart = startPos + text.length
                myField.selectionEnd = startPos + text.length
            } else {
                // add a space to the end of the pasted text
                let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                    ? this.tribute.replaceTextSuffix
                    : '\xA0'
                text += textSuffix
                this.pasteHtml(text, info.mentionPosition,
                    info.mentionPosition + info.mentionText.length + 1)
            }

            context.element.dispatchEvent(replaceEvent)
        }
    }

    pasteHtml(html, startPos, endPos) {
        let range, sel
        let context = this.tribute.current
        sel = this.getWindowSelection(context)
        range = this.getDocument(context).createRange()
        range.setStart(sel.anchorNode, startPos)
        range.setEnd(sel.anchorNode, endPos)
        range.deleteContents()

        let el = this.getDocument(context).createElement('div')
        el.innerHTML = html
        let frag = this.getDocument(context).createDocumentFragment(),
            node, lastNode
        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node)
        }
        range.insertNode(frag)

        // Preserve the selection
        if (lastNode) {
            range = range.cloneRange()
            range.setStartAfter(lastNode)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
        }
    }

    getNodePositionInParent(element) {
        if (element.parentNode === null) {
            return 0
        }

        for (var i = 0; i < element.parentNode.childNodes.length; i++) {
            let node = element.parentNode.childNodes[i]

            if (node === element) {
                return i
            }
        }
    }

    getContentEditableSelectedPath(ctx) {
        let sel = this.getWindowSelection(ctx)
        let selected = sel.anchorNode
        let path = []
        let offset

        if (selected != null) {
            let i
            let ce = selected.contentEditable
            while (selected !== null && ce !== 'true') {
                i = this.getNodePositionInParent(selected)
                path.push(i)
                selected = selected.parentNode
                if (selected !== null) {
                    ce = selected.contentEditable
                }
            }
            path.reverse()

            // getRangeAt may not exist, need alternative
            offset = sel.getRangeAt(0).startOffset

            return {
                selected: selected,
                path: path,
                offset: offset
            }
        }
    }

    getTextPrecedingCurrentSelection() {
        let context = this.tribute.current,
            text

        if (!this.isContentEditable(context.element)) {
            let textComponent = this.getDocument(context).activeElement
            let startPos = textComponent.selectionStart
            text = textComponent.value.substring(0, startPos)

        } else {
            let selectedElem = this.getWindowSelection(context).anchorNode

            if (selectedElem != null) {
                let workingNodeContent = selectedElem.textContent
                let selectStartOffset = this.getWindowSelection(context).getRangeAt(0).startOffset

                if (selectStartOffset >= 0) {
                    text = workingNodeContent.substring(0, selectStartOffset)
                }
            }
        }

        return text
    }

    getTriggerInfo(menuAlreadyActive, hasTrailingSpace, requireLeadingSpace, allowSpaces) {
        let ctx = this.tribute.current
        let selected, path, offset

        if (!this.isContentEditable(ctx.element)) {
            selected = this.getDocument(ctx).activeElement
        } else {
            let selectionInfo = this.getContentEditableSelectedPath(ctx)

            if (selectionInfo) {
                selected = selectionInfo.selected
                path = selectionInfo.path
                offset = selectionInfo.offset
            }
        }

        let effectiveRange = this.getTextPrecedingCurrentSelection()

        if (effectiveRange !== undefined && effectiveRange !== null) {
            let mostRecentTriggerCharPos = -1
            let triggerChar

            this.tribute.collection.forEach(config => {
                let c = config.trigger
                let idx = config.requireLeadingSpace ?
                    this.lastIndexWithLeadingSpace(effectiveRange, c) :
                    effectiveRange.lastIndexOf(c)

                if (idx > mostRecentTriggerCharPos) {
                    mostRecentTriggerCharPos = idx
                    triggerChar = c
                    requireLeadingSpace = config.requireLeadingSpace
                }
            })

            if (mostRecentTriggerCharPos >= 0 &&
                (
                    mostRecentTriggerCharPos === 0 ||
                    !requireLeadingSpace ||
                    /[\xA0\s]/g.test(
                        effectiveRange.substring(
                            mostRecentTriggerCharPos - 1,
                            mostRecentTriggerCharPos)
                    )
                )
            ) {
                let currentTriggerSnippet = effectiveRange.substring(mostRecentTriggerCharPos + 1,
                    effectiveRange.length)

                triggerChar = effectiveRange.substring(mostRecentTriggerCharPos, mostRecentTriggerCharPos + 1)
                let firstSnippetChar = currentTriggerSnippet.substring(0, 1)
                let leadingSpace = currentTriggerSnippet.length > 0 &&
                    (
                        firstSnippetChar === ' ' ||
                        firstSnippetChar === '\xA0'
                    )
                if (hasTrailingSpace) {
                    currentTriggerSnippet = currentTriggerSnippet.trim()
                }

                let regex = allowSpaces ? /[^\S ]/g : /[\xA0\s]/g;

                if (!leadingSpace && (menuAlreadyActive || !(regex.test(currentTriggerSnippet)))) {
                    return {
                        mentionPosition: mostRecentTriggerCharPos,
                        mentionText: currentTriggerSnippet,
                        mentionSelectedElement: selected,
                        mentionSelectedPath: path,
                        mentionSelectedOffset: offset,
                        mentionTriggerChar: triggerChar
                    }
                }
            }
        }
    }

    lastIndexWithLeadingSpace (str, char) {
        let reversedStr = str.split('').reverse().join('')
        let index = -1

        for (let cidx = 0, len = str.length; cidx < len; cidx++) {
            let firstChar = cidx === str.length - 1
            let leadingSpace = /\s/.test(reversedStr[cidx + 1])
            let match = char === reversedStr[cidx]

            if (match && (firstChar || leadingSpace)) {
                index = str.length - 1 - cidx
                break
            }
        }

        return index
    }

    isContentEditable(element) {
        return element.nodeName !== 'INPUT' && element.nodeName !== 'TEXTAREA'
    }

    getTextAreaOrInputUnderlinePosition(element, position) {
        let win = this.getWindow(this.tribute.current),
            doc = this.getDocument(this.tribute.current)

        let properties = ['direction', 'boxSizing', 'width', 'height', 'overflowX',
            'overflowY', 'borderTopWidth', 'borderRightWidth',
            'borderBottomWidth', 'borderLeftWidth', 'paddingTop',
            'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
            'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
            'textAlign', 'textTransform', 'textIndent',
            'textDecoration', 'letterSpacing', 'wordSpacing'
        ]

        let isFirefox = (win.mozInnerScreenX !== null)

        let div = doc.createElement('div')
        div.id = 'input-textarea-caret-position-mirror-div'
        doc.body.appendChild(div)

        let style = div.style
        let computed = win.getComputedStyle ? getComputedStyle(element) : element.currentStyle

        style.whiteSpace = 'pre-wrap'
        if (element.nodeName !== 'INPUT') {
            style.wordWrap = 'break-word'
        }

        // position off-screen
        style.position = 'absolute'
        style.visibility = 'hidden'

        // transfer the element's properties to the div
        properties.forEach(prop => {
            style[prop] = computed[prop]
        })

        if (isFirefox) {
            style.width = `${(parseInt(computed.width) - 2)}px`
            if (element.scrollHeight > parseInt(computed.height))
                style.overflowY = 'scroll'
        } else {
            style.overflow = 'hidden'
        }

        div.textContent = element.value.substring(0, position)

        if (element.nodeName === 'INPUT') {
            div.textContent = div.textContent.replace(/\s/g, ' ')
        }

        let span = doc.createElement('span')
        span.textContent = element.value.substring(position) || '.'
        div.appendChild(span)

        let rect = element.getBoundingClientRect()
        let docEl = doc.documentElement
        let windowLeft = (win.pageXOffset || docEl.scrollLeft) - (docEl.clientLeft || 0)
        let windowTop = (win.pageYOffset || docEl.scrollTop) - (docEl.clientTop || 0)

        let coordinates = {
            top: rect.top + windowTop + span.offsetTop + parseInt(computed.borderTopWidth) + parseInt(computed.fontSize) - element.scrollTop,
            left: rect.left + windowLeft + span.offsetLeft + parseInt(computed.borderLeftWidth)
        }

        doc.body.removeChild(div)

        return coordinates
    }

    getContentEditableCaretPosition(selectedNodePosition) {
        let win = this.getWindow(this.tribute.current),
            doc = this.getDocument(this.tribute.current)

        let markerTextChar = '﻿'
        let markerEl, markerId = `sel_${new Date().getTime()}_${Math.random().toString().substr(2)}`
        let range
        let sel = this.getWindowSelection(this.tribute.current)
        let prevRange = sel.getRangeAt(0)


        range = doc.createRange()
        range.setStart(sel.anchorNode, selectedNodePosition)
        range.setEnd(sel.anchorNode, selectedNodePosition)

        range.collapse(false)

        // Create the marker element containing a single invisible character using DOM methods and insert it
        markerEl = doc.createElement('span')
        markerEl.id = markerId
        markerEl.appendChild(doc.createTextNode(markerTextChar))
        range.insertNode(markerEl)
        sel.removeAllRanges()
        sel.addRange(prevRange)

        let rect = markerEl.getBoundingClientRect()
        let docEl = doc.documentElement
        let windowLeft = (win.pageXOffset || docEl.scrollLeft) - (docEl.clientLeft || 0)
        let windowTop = (win.pageYOffset || docEl.scrollTop) - (docEl.clientTop || 0)
        let coordinates = {
            left: rect.left + windowLeft,
            top: rect.top + markerEl.offsetHeight + windowTop
        }

        markerEl.parentNode.removeChild(markerEl)
        return coordinates
    }

    scrollIntoView(elem) {
        let win = this.getWindow(this.tribute.current),
            doc = this.getDocument(this.tribute.current)
        let reasonableBuffer = 20,
            clientRect
        let maxScrollDisplacement = 100
        let e = elem

        while (clientRect === undefined || clientRect.height === 0) {
            clientRect = e.getBoundingClientRect()

            if (clientRect.height === 0) {
                e = e.childNodes[0]
                if (e === undefined || !e.getBoundingClientRect) {
                    return
                }
            }
        }

        let elemTop = clientRect.top
        let elemBottom = elemTop + clientRect.height

        if (elemTop < 0) {
            win.scrollTo(0, win.pageYOffset + clientRect.top - reasonableBuffer)
        } else if (elemBottom > win.innerHeight) {
            let maxY = win.pageYOffset + clientRect.top - reasonableBuffer

            if (maxY - win.pageYOffset > maxScrollDisplacement) {
                maxY = win.pageYOffset + maxScrollDisplacement
            }

            let targetY = win.pageYOffset - (win.innerHeight - elemBottom)

            if (targetY > maxY) {
                targetY = maxY
            }

            win.scrollTo(0, targetY)
        }
    }
}


export default TributeRange;
