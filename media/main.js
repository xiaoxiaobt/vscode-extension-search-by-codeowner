"use strict";
// Search by Code Owner - Main TypeScript
(function () {
    'use strict';
    // Get VSCode API
    const vscode = window.acquireVsCodeApi();
    // DOM elements
    const searchByOwnerBtn = document.getElementById('searchByOwnerBtn');
    const fileCodeOwner = document.getElementById('fileCodeOwner');
    const activeFileDisplay = document.getElementById('activeFileDisplay');
    const codeOwnerInput = document.getElementById('codeOwnerInput');
    const codeOwnerDropdown = document.getElementById('codeOwnerDropdown');
    const dropdownToggle = document.getElementById('dropdownToggle');

    const reloadCodeOwnersBtn = document.getElementById('reloadCodeOwners');
    const hideGitIgnoreToggle = document.getElementById('hideGitIgnore');
    // State
    let hasCodeOwnersFile = false;
    let allOwners = [];
    let filteredOwners = [];
    let selectedOwner = '';
    let isDropdownOpen = false;
    let hideGitIgnoreFiles = true; // Default to true
    // Initialize the interface
    function initialize() {
        setupEventListeners();
        requestActiveFileInfo();
        requestCodeOwners();
        updateButtonState(); // Set initial disabled state
    }
    function setupEventListeners() {
        // Search functionality
        searchByOwnerBtn?.addEventListener('click', searchByCodeOwner);
        // Reload functionality
        reloadCodeOwnersBtn?.addEventListener('click', reloadCodeOwners);
        // Searchable dropdown handlers
        codeOwnerInput?.addEventListener('input', onInputChange);
        codeOwnerInput?.addEventListener('focus', onInputFocus);
        codeOwnerInput?.addEventListener('blur', onInputBlur);
        codeOwnerInput?.addEventListener('keydown', onInputKeydown);
        dropdownToggle?.addEventListener('click', onDropdownToggle);
        // Hide git ignore toggle
        hideGitIgnoreToggle?.addEventListener('change', onHideGitIgnoreToggle);
        // Close dropdown when clicking outside
        document.addEventListener('click', onDocumentClick);
    }
    function onInputChange(event) {
        const target = event.target;
        const query = target.value.toLowerCase();
        selectedOwner = target.value;
        if (query === '') {
            filteredOwners = [...allOwners];
        }
        else {
            filteredOwners = allOwners.filter(owner => owner.toLowerCase().includes(query));
        }
        updateDropdown();
        showDropdown();
        updateButtonState();
    }
    function onInputFocus() {
        filteredOwners = [...allOwners];
        updateDropdown();
        showDropdown();
    }
    function onInputBlur() {
        // Delay hiding to allow for dropdown clicks
        setTimeout(() => {
            hideDropdown();
        }, 150);
    }
    function onInputKeydown(event) {
        const items = codeOwnerDropdown?.querySelectorAll('.dropdown-item:not(.loading)');
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            navigateDropdown(items, 1);
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            navigateDropdown(items, -1);
        }
        else if (event.key === 'Enter') {
            event.preventDefault();

            // If dropdown is closed and we have a selected owner, trigger search
            if (!isDropdownOpen && selectedOwner.trim()) {
                searchByCodeOwner();
                return;
            }

            // Handle dropdown selection
            const selected = codeOwnerDropdown?.querySelector('.dropdown-item.selected');
            if (selected) {
                // If there's a selected item, use it
                selectOwner(selected.textContent || '');
            } else {
                // If no item is selected, select the first available item
                const firstItem = codeOwnerDropdown?.querySelector('.dropdown-item:not(.loading):not(.no-results)');
                if (firstItem) {
                    selectOwner(firstItem.textContent || '');
                }
            }
        }
        else if (event.key === 'Escape') {
            hideDropdown();
            codeOwnerInput?.blur();
        }
    }
    function onDropdownToggle() {
        if (isDropdownOpen) {
            hideDropdown();
        }
        else {
            filteredOwners = [...allOwners];
            updateDropdown();
            showDropdown();
            codeOwnerInput?.focus();
        }
    }
    function onDocumentClick(event) {
        const target = event.target;
        const dropdown = document.querySelector('.searchable-dropdown');
        if (dropdown && !dropdown.contains(target)) {
            hideDropdown();
        }
    }
    function navigateDropdown(items, direction) {
        const currentSelected = codeOwnerDropdown?.querySelector('.dropdown-item.selected');
        let currentIndex = -1;
        if (currentSelected) {
            currentIndex = Array.from(items).indexOf(currentSelected);
            currentSelected.classList.remove('selected');
        }
        let newIndex = currentIndex + direction;
        if (newIndex < 0)
            newIndex = items.length - 1;
        if (newIndex >= items.length)
            newIndex = 0;
        if (items[newIndex]) {
            items[newIndex].classList.add('selected');
            items[newIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    function showDropdown() {
        if (codeOwnerDropdown) {
            codeOwnerDropdown.classList.remove('hidden');
            isDropdownOpen = true;
        }
    }
    function hideDropdown() {
        if (codeOwnerDropdown) {
            codeOwnerDropdown.classList.add('hidden');
            isDropdownOpen = false;
        }
    }
    function updateDropdown() {
        if (!codeOwnerDropdown)
            return;
        if (filteredOwners.length === 0) {
            codeOwnerDropdown.innerHTML = '<div class="dropdown-item loading">No owners found</div>';
            return;
        }
        const html = filteredOwners.map(owner => `<div class="dropdown-item" data-owner="${escapeHtml(owner)}">${escapeHtml(owner)}</div>`).join('');
        codeOwnerDropdown.innerHTML = html;
        // Add click handlers to items
        const items = codeOwnerDropdown.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const owner = item.getAttribute('data-owner');
                if (owner) {
                    selectOwner(owner);
                }
            });
        });
    }
    function selectOwner(owner) {
        selectedOwner = owner;
        if (codeOwnerInput) {
            codeOwnerInput.value = owner;
        }
        hideDropdown();
        updateButtonState();
    }
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function updateButtonState() {
        if (!searchByOwnerBtn) return;

        const hasSelection = selectedOwner && selectedOwner.trim() !== '';

        if (hasSelection && hasCodeOwnersFile) {
            searchByOwnerBtn.disabled = false;
            searchByOwnerBtn.classList.remove('disabled');
        } else {
            searchByOwnerBtn.disabled = true;
            searchByOwnerBtn.classList.add('disabled');
        }
    }
    function searchByCodeOwner() {
        if (!selectedOwner.trim()) {
            showError('Please select or enter a code owner');
            return;
        }
        if (!hasCodeOwnersFile) {
            showError('No CODEOWNERS file found in workspace');
            return;
        }
        vscode.postMessage({
            type: 'searchByCodeOwner',
            owner: selectedOwner.trim(),
            hideGitIgnoreFiles: hideGitIgnoreFiles
        });
    }
    function reloadCodeOwners() {
        vscode.postMessage({
            type: 'reloadCodeOwners'
        });
    }
    function requestActiveFileInfo() {
        vscode.postMessage({
            type: 'getActiveFileInfo'
        });
    }
    function requestCodeOwners() {
        vscode.postMessage({
            type: 'getCodeOwners'
        });
    }
    function showError(message) {
        console.error('Code Owner Search:', message);
        // You could also show a visual error message in the UI
    }

    function onHideGitIgnoreToggle(event) {
        hideGitIgnoreFiles = event.target.checked;
    }

    function addBadgeClickHandlers() {
        const badges = fileCodeOwner?.querySelectorAll('.code-owner-badge.clickable');
        badges?.forEach(badge => {
            badge.addEventListener('click', onBadgeClick);
        });
    }

    function onBadgeClick(event) {
        const badge = event.target;
        const owner = badge.getAttribute('data-owner');

        if (owner && codeOwnerInput) {
            // Set the selected owner and update the input
            selectedOwner = owner;
            codeOwnerInput.value = owner;

            // Close dropdown if open
            if (isDropdownOpen) {
                hideDropdown();
            }

            // Update button state
            updateButtonState();

            // Automatically apply the owner filters
            searchByCodeOwner();
        }
    }
    function updateActiveFileInfo(data) {
        if (!activeFileDisplay || !fileCodeOwner) {
            return;
        }

        if (data.codeOwner && !data.codeOwner.isUnowned && data.codeOwner.owners.length > 0) {
            // Show the active file info section
            activeFileDisplay.classList.remove('hidden');
            // Create clickable owner badges
            const ownerBadges = data.codeOwner.owners.map(owner =>
                `<button class="code-owner-badge owned clickable" data-owner="${escapeHtml(owner)}" title="Click to apply ${escapeHtml(owner)} filters">${escapeHtml(owner)}</button>`
            ).join('');
            fileCodeOwner.innerHTML = ownerBadges;

            // Add click handlers to the newly created badges
            addBadgeClickHandlers();
        }
        else {
            // Hide the active file info section
            activeFileDisplay.classList.add('hidden');
        }
    }
    function updateCodeOwners(data) {
        hasCodeOwnersFile = data.hasCodeOwnersFile;
        allOwners = data.owners || [];
        filteredOwners = [...allOwners];
        // Add special virtual owners
        if (hasCodeOwnersFile) {
            allOwners.unshift('unowned', 'owned-by-all');
            filteredOwners = [...allOwners];
        }
        updateDropdown();
        updateButtonState();
    }

    // Message handler
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
            case 'activeFileInfo':
                updateActiveFileInfo(message);
                break;
            case 'codeOwners':
                updateCodeOwners(message);
                break;
        }
    });
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    }
    else {
        initialize();
    }
})();
