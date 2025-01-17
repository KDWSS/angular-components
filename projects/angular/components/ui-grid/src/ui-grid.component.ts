import range from 'lodash-es/range';
import {
    animationFrameScheduler,
    BehaviorSubject,
    combineLatest,
    merge,
    Observable,
    of,
    Subject,
} from 'rxjs';
import {
    debounceTime,
    distinctUntilChanged,
    filter,
    map,
    observeOn,
    share,
    shareReplay,
    startWith,
    switchMap,
    take,
    takeUntil,
    tap,
} from 'rxjs/operators';

import {
    animate,
    style,
    transition,
    trigger,
} from '@angular/animations';
import {
    AfterContentInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChild,
    ContentChildren,
    ElementRef,
    EventEmitter,
    HostBinding,
    Inject,
    InjectionToken,
    Input,
    NgZone,
    OnChanges,
    OnDestroy,
    Optional,
    Output,
    QueryList,
    SimpleChanges,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { QueuedAnnouncer } from '@uipath/angular/a11y';

import { UiGridColumnDirective } from './body/ui-grid-column.directive';
import {
    UiGridExpandedRowDirective,
} from './body/ui-grid-expanded-row.directive';
import { UiGridLoadingDirective } from './body/ui-grid-loading.directive';
import { UiGridNoContentDirective } from './body/ui-grid-no-content.directive';
import { UiGridRowActionDirective } from './body/ui-grid-row-action.directive';
import { UiGridRowConfigDirective } from './body/ui-grid-row-config.directive';
import { UiGridFooterDirective } from './footer/ui-grid-footer.directive';
import { UiGridHeaderDirective } from './header/ui-grid-header.directive';
import {
    DataManager,
    FilterManager,
    LiveAnnouncerManager,
    PerformanceMonitor,
    ResizeManager,
    ResizeManagerFactory,
    ResizeStrategy,
    SelectionManager,
    SortManager,
    VisibilityManger,
} from './managers';
import { ResizableGrid } from './managers/resize/types';
import {
    GridOptions,
    IGridDataEntry,
    ISortModel,
} from './models';
import { UiGridIntl } from './ui-grid.intl';

export const UI_GRID_OPTIONS = new InjectionToken<GridOptions<unknown>>('UiGrid DataManager options.');
const DEFAULT_VIRTUAL_SCROLL_ITEM_SIZE = 48;
const FOCUSABLE_ELEMENTS_QUERY = 'a, button:not([hidden]), input:not([hidden]), textarea, select, details, [tabindex]:not([tabindex="-1"])';

@Component({
    selector: 'ui-grid',
    templateUrl: './ui-grid.component.html',
    styleUrls: [
        './ui-grid.component.scss',
    ],
    animations: [
        trigger('filters-container', [
            transition(':enter', [
                style({
                    minHeight: '0',
                    height: '0',
                    opacity: '0',
                }),
                animate('0.15s ease-in', style({
                    opacity: '*',
                    minHeight: '*',
                    height: '*',
                    display: '*',
                })),
            ]),
            transition(':leave', [
                style({
                    minHeight: '*',
                    height: '*',
                }),
                animate('0.15s ease-in', style({
                    opacity: '0',
                    minHeight: '0',
                    height: '0',
                })),
            ]),
        ]),
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class UiGridComponent<T extends IGridDataEntry> extends ResizableGrid<T> implements AfterContentInit, OnChanges, OnDestroy {
    /**
     * The data list that needs to be rendered within the grid.
     *
     * NOTE: to have access to all functionality, we recommend that entities display in the grid implement the IGridDataEntry interface.
     *
     * @param value The list that needs to rendered.
     */
    @Input()
    set data(value: T[]) {
        this._performanceMonitor.reset();
        this.dataManager.update(value);
    }

    /**
     * Marks the grid resizing state.
     *
     */
    @HostBinding('class.ui-grid-state-resizing')
    @Input()
    get isResizing() {
        return this.resizeManager.isResizing;
    }

    /**
     * Marks the grid projected state.
     *
     */
    @HostBinding('class.ui-grid-state-projected')
    @Input()
    isProjected: boolean;

    /**
     * Determines if all of the items are currently checked.
     *
     */
    get isEveryVisibleRowChecked() {
        return !!this.dataManager.length &&
            this.dataManager.every(row => this.selectionManager.isSelected(row!));
    }

    /**
     * Determines if there's a value selected within the currently rendered items (used for multi-page selection).
     *
     */
    get hasValueOnVisiblePage() {
        return this.dataManager.some(row => this.selectionManager.isSelected(row!));
    }

    /**
     * The desired resize strategy.
     *
     * FIXME: Currently only `ImmediateNeighbourHalt` is stable.
     *
     */
    @Input()
    set resizeStrategy(value: ResizeStrategy) {
        if (value === this._resizeStrategy) { return; }

        this._resizeStrategy = value;

        if (this.resizeManager != null) {
            this.resizeManager.destroy();
        }

        this.resizeManager = ResizeManagerFactory(this._resizeStrategy, this);
    }

    /**
     * Marks the grid loading state.
     *
     */
    @HostBinding('class.ui-grid-state-loading')
    @Input()
    loading = false;

    /**
     * Marks the grid enabled state.
     *
     */
    @HostBinding('class.ui-grid-state-disabled')
    @Input()
    disabled = false;

    /**
     * Configure if the grid search filters are eager or on open.
     *
     */
    @Input()
    set collapseFiltersCount(count: number) {
        if (count === this._collapseFiltersCount$.value) { return; }
        this._collapseFiltersCount$.next(count);
    }
    get collapseFiltersCount() {
        return this._collapseFiltersCount$.value;
    }

    /**
     * Configure if the grid search filters are eager or on open.
     *
     */
    @Input()
    set fetchStrategy(fetchStrategy: 'eager' | 'onOpen') {
        if (fetchStrategy === this.fetchStrategy) { return; }
        this._fetchStrategy = fetchStrategy;
    }
    get fetchStrategy() {
        return this._fetchStrategy;
    }

    /**
     * Configure if the grid allows item selection.
     *
     */
    @Input()
    selectable = true;

    /**
     * Option to select an alternate layout for footer pagination.
     *
     */
    @Input()
    useLegacyDesign: boolean;

    /**
     * Option to have collapsible filters.
     *
     * @deprecated - use `[collapseFiltersCount]="0" to render collapsed or leave out to always render inline`
     */
    @Input()
    set collapsibleFilters(collapse: boolean) {
        this._collapseFiltersCount$.next(collapse ? 0 : Number.POSITIVE_INFINITY);
    }
    get collapsibleFilters() {
        return !this._collapseFiltersCount$.value;
    }

    /**
     * Configure if the grid allows to toggle column visibility.
     *
     */
    @Input()
    toggleColumns = false;

    /**
     * Configure if the grid allows multi-page selection.
     *
     */
    @HostBinding('class.ui-grid-mode-multi-select')
    @Input()
    multiPageSelect = false;

    /**
     * Configure if the grid is refreshable.
     *
     */
    @Input()
    refreshable = true;

    /**
     * Configure if `virtualScroll` is enabled.
     *
     */
    @Input()
    virtualScroll = false;

    /**
     * Configure the row item size for virtualScroll
     *
     */
    @Input()
    rowSize: number;

    /**
     * Show paint time stats
     *
     */
    @Input()
    showPaintTime = false;

    /**
     * Provide a custom `noDataMessage`.
     *
     */
    @Input()
    noDataMessage?: string;

    /**
     * Set the expanded entry.
     *
     */
    @Input()
    expandedEntry?: T;

    /**
     * Configure if the expanded entry should replace the active row, or add a new row with the expanded view.
     *
     */
    @Input()
    expandMode: 'preserve' | 'collapse' = 'collapse';

    /**
     * Configure if ui-grid-header-row should be visible, by default it is visible
     *
     */
    @Input()
    showHeaderRow = true;

    /**
     * Configure a function that receives the whole grid row, and returns
     * disabled message if the row should not be selectable
     *
     */
    @Input()
    disableSelectionByEntry: (entry: T) => null | string;

    /**
     * Emits an event with the sort model when a column sort changes.
     *
     */
    @Output()
    sortChange = new EventEmitter<ISortModel<T>>();

    /**
     * Emits an event when user click the refresh button.
     *
     */
    @Output()
    refresh = new EventEmitter<void>();

    /**
     * Emits an event once the grid has been rendered.
     *
     */
    @Output()
    rendered = new EventEmitter<void>();

    /**
     * Emits the column definitions when their definition changes.
     *
     */
    columns$ = new BehaviorSubject<UiGridColumnDirective<T>[]>([]);

    /**
     * Row configuration directive reference.
     *
     * @ignore
     */
    @ContentChild(UiGridRowConfigDirective, {
        static: true,
    })
    rowConfig?: UiGridRowConfigDirective<T>;

    /**
     * Row action directive reference.
     *
     * @ignore
     */
    @ContentChild(UiGridRowActionDirective, {
        static: true,
    })
    actions?: UiGridRowActionDirective;

    /**
     * Footer directive reference.
     *
     * @ignore
     */
    @ContentChild(UiGridFooterDirective, {
        static: true,
    })
    footer?: UiGridFooterDirective;

    /**
     * Header directive reference.
     *
     * @ignore
     */
    @ContentChild(UiGridHeaderDirective, {
        static: true,
    })
    header?: UiGridHeaderDirective<T>;

    /**
     * Column directive reference list.
     *
     * @ignore
     */
    @ContentChildren(UiGridColumnDirective)
    columns!: QueryList<UiGridColumnDirective<T>>;

    /**
     * Expanded row template reference.
     *
     * @ignore
     */
    @ContentChild(UiGridExpandedRowDirective, {
        static: true,
    })
    expandedRow?: UiGridExpandedRowDirective;

    /**
     * No content custom template reference.
     *
     * @ignore
     */
    @ContentChild(UiGridNoContentDirective, {
        static: true,
    })
    noContent?: UiGridNoContentDirective;

    /**
     * Custom loading template reference.
     *
     * @ignore
     */
    @ContentChild(UiGridLoadingDirective, {
        static: true,
    })
    loadingState?: UiGridLoadingDirective;
    /**
     * Reference to the grid action buttons container
     *
     * @ignore
     */
    @ViewChild('gridActionButtons')
    gridActionButtons!: ElementRef;
    /**
     * Toggle filters row display state
     *
     */
    showFilters = false;

    /**
     * Live announcer manager, used to emit notification via `aria-live`.
     *
     */
    liveAnnouncerManager?: LiveAnnouncerManager<T>;

    /**
     * Selection manager, used to manage grid selection states.
     *
     */
    selectionManager = new SelectionManager<T>();

    /**
     * Data manager, used to optimize row rendering.
     *
     */
    dataManager = new DataManager<T>(this._gridOptions);

    /**
     * Filter manager, used to manage filter state changes.
     *
     */
    filterManager = new FilterManager<T>();

    /**
     * Visibility manager, used to manage visibility of columns.
     *
     */
    visibilityManager = new VisibilityManger<T>();

    /**
     * Sort manager, used to manage sort state changes.
     *
     */
    sortManager = new SortManager<T>();

    /**
     * Resize manager, used to compute resized column states.
     *
     */
    resizeManager: ResizeManager<T>;

    /**
     * @ignore
     */
    paintTime$: Observable<string>;

    /**
     * Emits with information whether filters are defined.
     *
     */
    isAnyFilterDefined$ = new BehaviorSubject<boolean>(false);

    /**
     * Emits with information whether any filter is visible.
     *
     */
    hasAnyFiltersVisible$: Observable<boolean>;

    /**
     * Emits the visible column definitions when their definition changes.
     *
     */
    visible$ = this.visibilityManager.columns$;

    /**
     * Returns the scroll size, in order to compensate for the scrollbar.
     *
     * @deprecated
     */
    scrollCompensationWidth = 0;

    /**
     * @internal
     * @ignore
     */
    scrollCompensationWidth$ = this.dataManager.data$.pipe(
        map(data => data.length),
        distinctUntilChanged(),
        observeOn(animationFrameScheduler),
        debounceTime(0),
        map(() => this._ref.nativeElement.querySelector('.ui-grid-viewport')),
        map(view => view ? view.offsetWidth - view.clientWidth : 0),
        // eslint-disable-next-line import/no-deprecated
        tap(compensationWidth => this.scrollCompensationWidth = compensationWidth),
    );

    hasSelection$ = this.selectionManager.hasValue$.pipe(
        tap(hasSelection => {
            if (hasSelection && !!this.header?.actionButtons?.length) {
                this._announceGridHeaderActions();
            }
        }),
        share(),
    );

    renderedColumns$ = this.visible$.pipe(
        map(columns => {
            const firstIndex = columns.findIndex(c => c.primary);
            const rowHeaderIndex = firstIndex > -1 ? firstIndex : 0;

            return columns.map((directive, index) => ({
                directive,
                role: index === rowHeaderIndex ? 'rowheader' : 'gridcell',
            }));
        }),
    );

    areFilersCollapsed$: Observable<boolean>;

    /**
     * Determines if the multi-page selection row should be displayed.
     *
     */
    get showMultiPageSelectionInfo() {
        return this.multiPageSelect &&
            !this.dataManager.pristine &&
            (
                this.dataManager.length ||
                this.selectionManager.selected.length
            );
    }

    protected _destroyed$ = new Subject<void>();
    protected _columnChanges$: Observable<SimpleChanges>;

    private _fetchStrategy!: 'eager' | 'onOpen';
    private _collapseFiltersCount$!: BehaviorSubject<number>;
    private _resizeStrategy = ResizeStrategy.ImmediateNeighbourHalt;
    private _performanceMonitor: PerformanceMonitor;
    private _configure$ = new Subject<void>();
    private _isShiftPressed = false;
    private _lastCheckboxIdx = 0;

    /**
     * @ignore
     */
    constructor(
        @Optional()
        public intl: UiGridIntl,
        protected _ref: ElementRef,
        protected _cd: ChangeDetectorRef,
        private _zone: NgZone,
        private _queuedAnnouncer: QueuedAnnouncer,
        @Inject(UI_GRID_OPTIONS)
        @Optional()
        private _gridOptions?: GridOptions<T>,
    ) {
        super();

        this.disableSelectionByEntry = () => null;
        this.useLegacyDesign = _gridOptions?.useLegacyDesign ?? false;
        this._fetchStrategy = _gridOptions?.fetchStrategy ?? 'onOpen';
        this.rowSize = _gridOptions?.rowSize ?? DEFAULT_VIRTUAL_SCROLL_ITEM_SIZE;
        this._collapseFiltersCount$ = new BehaviorSubject(
            _gridOptions?.collapseFiltersCount ?? (_gridOptions?.collapsibleFilters === true ? 0 : Number.POSITIVE_INFINITY),
        );

        this.isProjected = this._ref.nativeElement.classList.contains('ui-grid-state-responsive');

        this.intl = intl || new UiGridIntl();

        this._columnChanges$ =
            this.rendered.pipe(
                switchMap(() => merge(
                    ...this.columns.map(column =>
                        column.change$,
                    )),
                ),
                debounceTime(10),
                tap(() => this.isResizing && this.resizeManager.stop()),
            );

        const visibleFilterCount$ = this.rendered.pipe(
            switchMap(() => this.columns.changes),
            startWith('Initial emission'),
            switchMap(() =>
                combineLatest(this.columns.map((column: UiGridColumnDirective<T>) =>
                    column.dropdown?.visible$ ?? column.searchableDropdown?.visible$ ?? of(false),
                )),
            ),
            map(areVisible => areVisible.filter(visible => visible).length),
            distinctUntilChanged(),
            shareReplay(),
        );

        this.hasAnyFiltersVisible$ = visibleFilterCount$.pipe(
            map(Boolean),
            distinctUntilChanged(),
        );

        this.areFilersCollapsed$ = combineLatest([
            visibleFilterCount$,
            this._collapseFiltersCount$,
        ]).pipe(
            map(([visible, minCollapse]) => visible > minCollapse),
            distinctUntilChanged(),
        );

        const sort$ = this.sortManager
            .sort$
            .pipe(
                tap(ev => this.sortChange.emit(ev)),
            );

        const inputChanges$ = merge(
            this.intl.changes,
            this._configure$,
            this._columnChanges$,
        ).pipe(
            map(() => this.columns.toArray()),
            tap(columns => this.filterManager.columns = columns),
            tap(columns => this.sortManager.columns = columns),
            tap(columns => this.visibilityManager.columns = columns),
            tap(columns => this.columns$.next(columns)),
            tap(columns => this.isAnyFilterDefined$.next(
                columns.some(c => !!c.dropdown || !!c.searchableDropdown),
            )),
        );

        const data$ = this.dataManager.data$.pipe(
            tap(_ => this._lastCheckboxIdx = 0),
        );

        const selection$ = this.selectionManager.changed$.pipe(
            tap(_ => this._cd.markForCheck()),
        );

        merge(
            sort$,
            inputChanges$,
            data$,
            selection$,
        ).pipe(
            takeUntil(this._destroyed$),
        ).subscribe();

        this.resizeManager = ResizeManagerFactory(this._resizeStrategy, this);
        this._performanceMonitor = new PerformanceMonitor(_ref.nativeElement);
        this.paintTime$ = this._performanceMonitor.paintTime$;
    }

    /**
     * @ignore
     */
    ngAfterContentInit() {
        this.selectionManager.disableSelectionByEntry = this.disableSelectionByEntry;

        this.liveAnnouncerManager = new LiveAnnouncerManager(
            msg => this._queuedAnnouncer.enqueue(msg),
            this.intl,
            this.dataManager.data$,
            this.sortManager.sort$.pipe(
                filter(({ userEvent }) => !!userEvent),
            ),
            this.refresh,
            this.footer?.pageChange,
        );

        this._configure$.next();

        this._zone.onStable.pipe(
            take(1),
        ).subscribe(() => {
            // ensure everything is painted once initial rendering is done
            // a lot of templates loaded lazily, this is required
            // to ensure everything is drawn once the grid is initalized
            this._cd.markForCheck();

            this.rendered.next();
        });

        this.columns.changes
            .pipe(
                takeUntil(this._destroyed$),
            ).subscribe(
                () => this._configure$.next(),
            );
    }

    /**
     * @ignore
     */
    ngOnChanges(changes: SimpleChanges) {
        const selectableChange = changes.selectable;
        if (
            selectableChange &&
            !selectableChange.firstChange &&
            selectableChange.previousValue !== selectableChange.currentValue
        ) {
            this.selectionManager.clear();
            this._configure$.next();
        }

        const dataChange = changes.data;

        if (
            dataChange &&
            !dataChange.firstChange &&
            !this.multiPageSelect
        ) {
            this._performanceMonitor.reset();
            this.selectionManager.clear();
        }
    }

    /**
     * @ignore
     */
    ngOnDestroy() {
        this.sortChange.complete();
        this.rendered.complete();
        this.columns$.complete();
        this.isAnyFilterDefined$.complete();

        this.dataManager.destroy();
        this.resizeManager.destroy();
        this.sortManager.destroy();
        this.selectionManager.destroy();
        this.filterManager.destroy();
        this.visibilityManager.destroy();

        if (this.liveAnnouncerManager) {
            this.liveAnnouncerManager.destroy();
        }

        this._performanceMonitor.destroy();

        this._destroyed$.next();
        this._destroyed$.complete();
        this._configure$.complete();
    }

    /**
     * Marks if the `Shift` key is pressed.
     */
    checkShift(event: MouseEvent | KeyboardEvent) {
        event.stopPropagation();

        this._isShiftPressed = event.shiftKey;
    }

    /**
     * Handles row selection, and reacts if the `Shift` key is pressed.
     *
     * @param idx The clicked row index.
     * @param entry The entry associated to the selected row.
     */
    handleSelection(idx: number, entry: T) {
        if (!this._isShiftPressed) {
            this._lastCheckboxIdx = idx;
            this.selectionManager.toggle(entry);
            return;
        }

        const min = Math.min(this._lastCheckboxIdx, idx);
        const max = Math.max(idx, this._lastCheckboxIdx);

        const rowsForSelection = range(min, max + 1)
            .map(this.dataManager.get);
        const rowsForDeselection = this.dataManager.data$.getValue()
            .filter(row => !rowsForSelection.find(rowForSelection => rowForSelection.id === row.id));

        /**
         * To be consistent with the browser, if we click on a row
         * that was already selected, we unselect it, sync with DOM (detectChanges),
         * then we select it again (it's included in rowsForSelection).
         */
        if (this.selectionManager.isSelected(entry)) {
            this.selectionManager.deselect(entry);
            this._cd.detectChanges();
        }

        this.selectionManager.select(...rowsForSelection.filter(row => !this.selectionManager.isSelected(row)));
        this.selectionManager.deselect(...rowsForDeselection.filter(row => this.selectionManager.isSelected(row)));

        this._cd.detectChanges();
    }

    /**
     * Toggles the row selection state.
     *
     */
    toggle(ev: MatCheckboxChange) {
        if (ev.checked) {
            this.dataManager.forEach(row => this.selectionManager.select(row!));
        } else {
            this._lastCheckboxIdx = 0;
            this.dataManager.forEach(row => this.selectionManager.deselect(row!));
        }
    }

    /**
     * Determines the `checkbox` `matToolTip`.
     *
     * @param [row] The row for which the label is computed.
     */
    checkboxTooltip(row?: T): string {
        if (!row) {
            return this.intl.checkboxTooltip(this.isEveryVisibleRowChecked);
        }

        return this.intl.checkboxTooltip(this.selectionManager.isSelected(row), this.dataManager.indexOf(row));
    }

    /**
     * Determines the `checkbox` aria-label`.
     * **DEPRECATED**
     *
     * @param [row] The row for which the label is computed.
     */
    checkboxLabel(row?: T): string {
        if (!row) {
            return `${this.isEveryVisibleRowChecked ? 'select' : 'deselect'} all`;
        }
        return `${this.selectionManager.isSelected(row) ? 'deselect' : 'select'} row ${this.dataManager.indexOf(row)}`;
    }

    focusRowHeader() {
        this.gridActionButtons?.nativeElement.querySelector(FOCUSABLE_ELEMENTS_QUERY)?.focus();
    }

    private _announceGridHeaderActions() {
        this._queuedAnnouncer.enqueue(this.intl.gridHeaderActionsNotice);
    }
}
