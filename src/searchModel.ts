import * as vscode from 'vscode';

export interface SearchMatch {
    range: vscode.Range;
    text: string;
    lineText: string;
}

export interface SearchResult {
    uri: vscode.Uri;
    matches: SearchMatch[];
}

export interface SearchOptions {
    query: string;
    replaceText?: string;
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
    includePatterns: string[];
    excludePatterns: string[];
    maxResults?: number;
}

export class SearchModel {
    private _results: SearchResult[] = [];
    private _currentSearch: SearchOptions | null = null;
    private _onDidChangeResults = new vscode.EventEmitter<void>();
    
    public readonly onDidChangeResults = this._onDidChangeResults.event;

    public get results(): SearchResult[] {
        return this._results;
    }

    public get currentSearch(): SearchOptions | null {
        return this._currentSearch;
    }

    public setResults(results: SearchResult[], searchOptions: SearchOptions): void {
        this._results = results;
        this._currentSearch = searchOptions;
        this._onDidChangeResults.fire();
    }

    public clearResults(): void {
        this._results = [];
        this._currentSearch = null;
        this._onDidChangeResults.fire();
    }

    public hasResults(): boolean {
        return this._results.length > 0;
    }

    public getTotalMatches(): number {
        return this._results.reduce((total, result) => total + result.matches.length, 0);
    }

    public getFileCount(): number {
        return this._results.length;
    }

    public getResultSummary(): string {
        const totalMatches = this.getTotalMatches();
        const fileCount = this.getFileCount();
        
        if (totalMatches === 0) {
            return 'No results';
        }
        
        const matchText = totalMatches === 1 ? 'result' : 'results';
        const fileText = fileCount === 1 ? 'file' : 'files';
        
        return `${totalMatches} ${matchText} in ${fileCount} ${fileText}`;
    }

    public dispose(): void {
        this._onDidChangeResults.dispose();
    }
}
