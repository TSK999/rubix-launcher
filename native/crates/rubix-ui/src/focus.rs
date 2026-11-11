//! iced's stock button is pointer-only. This wrapper adds real focus operations,
//! visible focus rings, and Enter/Space activation without synthesizing clicks.
use crate::Message;
use iced::advanced::{
    Clipboard, Layout, Renderer as _, Shell, Widget, layout, overlay, renderer,
    widget::{Operation, Tree, operation::focusable::Focusable, tree},
};
use iced::{
    Element, Event, Length, Padding, Rectangle, Renderer, Size, Theme, Vector,
    keyboard::{self, Key, key::Named},
    mouse,
    widget::button as native,
};

pub struct ActionButton<'a> {
    inner: native::Button<'a, Message>,
    press: Option<Message>,
}
pub fn button<'a>(content: impl Into<Element<'a, Message>>) -> ActionButton<'a> {
    ActionButton {
        inner: iced::widget::button(content),
        press: None,
    }
}
impl<'a> ActionButton<'a> {
    pub fn on_press(mut self, message: Message) -> Self {
        self.press = Some(message.clone());
        self.inner = self.inner.on_press(message);
        self
    }
    pub fn on_press_maybe(mut self, message: Option<Message>) -> Self {
        self.press = message.clone();
        self.inner = self.inner.on_press_maybe(message);
        self
    }
    pub fn padding(mut self, padding: impl Into<Padding>) -> Self {
        self.inner = self.inner.padding(padding);
        self
    }
    pub fn width(mut self, width: impl Into<Length>) -> Self {
        self.inner = self.inner.width(width);
        self
    }
    pub fn height(mut self, height: impl Into<Length>) -> Self {
        self.inner = self.inner.height(height);
        self
    }
    pub fn style(mut self, style: impl Fn(&Theme, native::Status) -> native::Style + 'a) -> Self {
        self.inner = self.inner.style(style);
        self
    }
}
impl<'a> From<ActionButton<'a>> for Element<'a, Message> {
    fn from(value: ActionButton<'a>) -> Self {
        Element::new(FocusButton {
            content: value.inner.into(),
            press: value.press,
        })
    }
}
#[derive(Default)]
struct State {
    focused: bool,
}
impl Focusable for State {
    fn is_focused(&self) -> bool {
        self.focused
    }
    fn focus(&mut self) {
        self.focused = true;
    }
    fn unfocus(&mut self) {
        self.focused = false;
    }
}
struct FocusButton<'a> {
    content: Element<'a, Message>,
    press: Option<Message>,
}

/// Freeze the underlying view while a modal owns focus and input.
pub fn inert<'a>(content: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
    Element::new(Inert {
        content: content.into(),
    })
}
struct Inert<'a> {
    content: Element<'a, Message>,
}
struct InertState;
impl Widget<Message, Theme, Renderer> for Inert<'_> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<InertState>()
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.content)]
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(std::slice::from_ref(&self.content));
    }
    fn size(&self) -> Size<Length> {
        self.content.as_widget().size()
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        self.content
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits)
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut Renderer,
        theme: &Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        self.content.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            layout,
            cursor,
            viewport,
        );
    }
}
impl Widget<Message, Theme, Renderer> for FocusButton<'_> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<State>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(State::default())
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.content)]
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(std::slice::from_ref(&self.content));
    }
    fn size(&self) -> Size<Length> {
        self.content.as_widget().size()
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        self.content
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits)
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &Renderer,
        operation: &mut dyn Operation,
    ) {
        let state = tree.state.downcast_mut::<State>();
        if self.press.is_some() {
            operation.focusable(None, layout.bounds(), state);
        } else {
            state.unfocus();
        }
        self.content
            .as_widget_mut()
            .operate(&mut tree.children[0], layout, renderer, operation);
    }
    fn update(
        &mut self,
        tree: &mut Tree,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        renderer: &Renderer,
        clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
        viewport: &Rectangle,
    ) {
        let state = tree.state.downcast_mut::<State>();
        if let Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) = event {
            state.focused = cursor.is_over(layout.bounds()) && self.press.is_some();
        }
        if let Event::Keyboard(keyboard::Event::KeyPressed {
            key: Key::Named(Named::Enter | Named::Space),
            repeat: false,
            ..
        }) = event
            && state.focused
            && !shell.is_event_captured()
            && let Some(message) = &self.press
        {
            shell.publish(message.clone());
            shell.capture_event();
            return;
        }
        self.content.as_widget_mut().update(
            &mut tree.children[0],
            event,
            layout,
            cursor,
            renderer,
            clipboard,
            shell,
            viewport,
        );
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut Renderer,
        theme: &Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        self.content.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            layout,
            cursor,
            viewport,
        );
        if tree.state.downcast_ref::<State>().focused && self.press.is_some() {
            renderer.fill_quad(
                renderer::Quad {
                    bounds: layout.bounds(),
                    border: iced::Border {
                        color: theme.palette().primary,
                        width: 2.0,
                        radius: 9.0.into(),
                    },
                    ..Default::default()
                },
                iced::Color::TRANSPARENT,
            );
        }
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
        renderer: &Renderer,
    ) -> mouse::Interaction {
        self.content.as_widget().mouse_interaction(
            &tree.children[0],
            layout,
            cursor,
            viewport,
            renderer,
        )
    }
    fn overlay<'b>(
        &'b mut self,
        tree: &'b mut Tree,
        layout: Layout<'b>,
        renderer: &Renderer,
        viewport: &Rectangle,
        translation: Vector,
    ) -> Option<overlay::Element<'b, Message, Theme, Renderer>> {
        self.content.as_widget_mut().overlay(
            &mut tree.children[0],
            layout,
            renderer,
            viewport,
            translation,
        )
    }
}
