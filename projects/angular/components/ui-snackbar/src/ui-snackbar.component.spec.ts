import { OverlayContainer } from '@angular/cdk/overlay';
import {
    Component,
    TemplateRef,
    ViewChild,
} from '@angular/core';
import {
    async,
    ComponentFixture,
    fakeAsync,
    TestBed,
    tick,
} from '@angular/core/testing';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import * as faker from 'faker';

import {
    ICON_MAP,
    panelClass,
    SnackbarAction,
    SnackBarType,
    UiSnackBarService,
} from './ui-snackbar.component';
import { UiSnackBarModule } from './ui-snackbar.module';

const DEFAULT_DURATION = 2500;

@Component({
    template: `<ng-template #richContent>
                <div class="rich-class">Some Rich</div>
                <a href="#">content</a>
               </ng-template>`,
})
export class SnackBarFixtureComponent {
    @ViewChild('richContent', { static: true })
    public richContent!: TemplateRef<any>;

    constructor(public service: UiSnackBarService) { }
}

describe('Service: UiSnackBarService', () => {
    let service: UiSnackBarService;
    let overlayContainer: OverlayContainer;
    let fixture: ComponentFixture<SnackBarFixtureComponent>;

    const getSnack = () =>
        overlayContainer
            .getContainerElement()
            .querySelector('.mat-snack-bar-container');

    const getMethodFor = (type: SnackBarType): SnackbarAction => {
        switch (type) {
            case SnackBarType.Info:
                return service.info;
            case SnackBarType.Success:
                return service.success;
            case SnackBarType.Warning:
                return service.warning;
            case SnackBarType.Error:
                return service.error;

            default:
                throw new Error(`No method found for type ${type}.`);
        }
    };

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            imports: [
                NoopAnimationsModule,
                UiSnackBarModule,
            ],
            providers: [
                {
                    provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
                    useValue: {
                        duration: DEFAULT_DURATION,
                    },
                },
            ],
            declarations: [
                SnackBarFixtureComponent,
            ],
        });

        overlayContainer = TestBed.get<OverlayContainer>(OverlayContainer);
        fixture = TestBed.createComponent(SnackBarFixtureComponent);
        service = fixture.componentInstance.service;
    }));

    afterEach(async () => {
        service.clear();
        fixture.detectChanges();
        await fixture.whenStable();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    [
        SnackBarType.Info,
        SnackBarType.Success,
        SnackBarType.Warning,
        SnackBarType.Error,
    ].forEach(type => {
        describe(`Type: ${type}`, () => {
            it('should display the snack via generic show', () => {
                service.show(faker.lorem.paragraph(), { type });

                const snack = getSnack();
                expect(snack).toBeDefined();
                expect(snack!.classList.contains(panelClass(type))).toBeTruthy();
            });

            it('should display the snack via generic show with correct message', () => {
                const message = faker.lorem.paragraph();
                service.show(message, { type });

                const snack = getSnack();
                expect(snack).toBeDefined();
                expect(snack!.querySelector<HTMLElement>('.ui-snackbar-message span')!.innerText.trim()).toBe(message);
            });

            it('should display the snack via the helper method', () => {
                const method = getMethodFor(type);
                method(faker.lorem.paragraph());

                const snack = getSnack();
                expect(snack).toBeDefined();
                expect(snack!.classList.contains(panelClass(type))).toBeTruthy();
            });

            it('should display the correct icon', () => {
                const method = getMethodFor(type);
                method(faker.lorem.paragraph());

                const snack = getSnack()!;
                const icon = snack.querySelector<HTMLElement>('.ui-snackbar-message mat-icon');

                expect(icon).toBeDefined();
                expect(icon!.innerText).toEqual(ICON_MAP.get(type)!);
            });

            it('should display the close icon', () => {
                const method = getMethodFor(type);
                method(faker.lorem.paragraph());

                const snack = getSnack()!;
                const icon = snack.querySelector<HTMLElement>('.ui-snackbar-dismiss mat-icon');

                expect(icon).toBeDefined();
                expect(icon!.innerText).toEqual('close');
            });

            it('should dismiss after 1000ms', fakeAsync(() => {
                const method = getMethodFor(type);

                const timeout = 1000;
                method(faker.lorem.paragraph(), timeout);
                fixture.detectChanges();

                tick(timeout - 1);
                const snack = getSnack();
                expect(snack).toBeDefined();

                tick(1);
                const snackAfterTimeout = getSnack();
                expect(snackAfterTimeout).toBeNull();
            }));

            it('should dismiss after 5000ms and then after 1000ms', fakeAsync(() => {
                const method = getMethodFor(type);

                const firstTimeout = 5000;
                method(faker.lorem.paragraph(), firstTimeout);
                fixture.detectChanges();

                tick(firstTimeout - 1);
                const firstSnack = getSnack();
                expect(firstSnack).toBeDefined();

                tick(1);
                const firstSnackAfterTimeout = getSnack();
                expect(firstSnackAfterTimeout).toBeNull();

                const secondTimeout = 1000;
                method(faker.lorem.paragraph(), secondTimeout);
                fixture.detectChanges();

                tick(secondTimeout - 1);
                const secondSnack = getSnack();
                expect(secondSnack).toBeDefined();

                tick(1);
                const secondSnackAfterTimeout = getSnack();
                expect(secondSnackAfterTimeout).toBeNull();
            }));

            it('should dismiss after the default duration', fakeAsync(() => {
                const method = getMethodFor(type);

                method(faker.lorem.paragraph());
                fixture.detectChanges();

                tick(DEFAULT_DURATION - 1);
                const snackBeforeTimeout = getSnack();
                expect(snackBeforeTimeout).toBeDefined();

                tick(1);
                const snackAfterTimeout = getSnack();
                expect(snackAfterTimeout).toBeDefined();
            }));
        });

    });

    describe(`Type: None`, () => {
        it('should display a snack type None if called show with no options', () => {
            service.show(faker.lorem.paragraph());

            const snack = getSnack();
            expect(snack).toBeDefined();
            expect(snack!.classList.contains(panelClass(SnackBarType.None))).toBeTruthy();
        });

        it('should display a snack with no icon if called show with no options', () => {
            service.show(faker.lorem.paragraph());

            const snack = getSnack();
            expect(snack).toBeDefined();
            expect(snack!.querySelector<HTMLElement>('.ui-snackbar-message mat-icon')).toBeNull();
        });

        it('should display a snack with custom icon', () => {
            service.show(faker.lorem.paragraph(), { icon: 'home' });

            const snack = getSnack()!;
            expect(snack).toBeDefined();

            const icon = snack.querySelector<HTMLElement>('.ui-snackbar-message mat-icon');

            expect(icon).toBeDefined();
            expect(icon!.innerText).toEqual('home');
        });

        it('should display the close icon', () => {
            service.show(faker.lorem.paragraph());

            const snack = getSnack()!;
            const icon = snack.querySelector<HTMLElement>('.ui-snackbar-dismiss mat-icon');

            expect(icon).toBeDefined();
            expect(icon!.innerText).toEqual('close');
        });
    });

    it('should break new lines when displaying content', () => {
        const lineCount = 5;
        const lines = faker.lorem.lines(lineCount);

        service.show(lines);

        const snack = getSnack();
        expect(snack).not.toBeNull();
        expect(snack!.querySelectorAll('br').length).toEqual(lineCount - 1);
    });

    it('should clear the snackbar', async () => {
        service.show(faker.random.word());

        const snack = getSnack();
        expect(snack).not.toBeNull();

        service.clear();
        fixture.detectChanges();
        await fixture.whenStable();

        const snackAfterClear = getSnack();
        expect(snackAfterClear).toBeNull();
    });

    it('should show rich context via template', () => {
        // make sure the template is initialized
        fixture.detectChanges();

        service.success(fixture.componentInstance.richContent);
        const snack = getSnack()!;

        expect(snack).not.toBeNull();
        expect(snack.querySelectorAll('div.rich-class').length).toEqual(1);
        expect(snack.querySelectorAll('a').length).toEqual(1);
    });
});
