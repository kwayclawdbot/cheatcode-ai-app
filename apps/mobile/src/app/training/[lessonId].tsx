import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow, Num } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import {
  dayForLesson,
  lessonContentFor,
  lessonNodeById,
} from '../../features/training/curriculum';
import { LessonRunner } from '../../features/training/engine/LessonRunner';
import { useTraining } from '../../features/training/store';

/**
 * THE LESSON ROUTE.
 *
 * Resolves the node, then does one of three things and never guesses:
 *   • the id is not a lesson          → says so
 *   • the lesson has no content yet   → says so, plainly, with a way back
 *   • the lesson has content          → hands it to the runner
 *
 * The middle case is unreachable through the UI — the landing screen marks
 * unwritten lessons SOON and does not open them — but a URL is a URL, and a
 * screen reached by one still has to tell the truth.
 */
export default function TrainingLesson() {
  const router = useRouter();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { setCurrentLesson, ready } = useTraining();

  const node = lessonNodeById(String(lessonId));
  const day = node ? dayForLesson(node.id) : null;
  const content = node ? lessonContentFor(node.id) : null;

  const backToPath = () => router.replace('/training' as never);

  const header = (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: alpha.ivory07,
        }}
      >
        <Pressable onPress={() => (router.canGoBack() ? router.back() : backToPath())} hitSlop={12}>
          <T size={22} c={color.muted}>‹</T>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow c={color.volt}>{day ? `DAY ${day.index} OF 7` : 'TRAINING'}</Eyebrow>
          <T size={13.5} weight="bold" numberOfLines={1}>{node?.title ?? 'Lesson'}</T>
        </View>
        {node ? <Num size={11} c={color.muted}>{`${node.minutes} min`}</Num> : null}
      </View>
    </>
  );

  if (!node) {
    return (
      <Screen variant="corner" testID="screen-training-lesson">
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <ObjectCard r={radius.xl} style={{ padding: 16, gap: 9 }}>
            <T size={13} weight="bold">No such lesson</T>
            <T size={12.5} lh={19} c={color.muted}>
              Nothing in the programme has the id “{String(lessonId)}”.
            </T>
          </ObjectCard>
          <Button label="Back to the Path" onPress={backToPath} />
        </ScrollView>
      </Screen>
    );
  }

  if (!content || !node.hasContent) {
    return (
      <Screen variant="corner" testID="screen-training-lesson">
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <ObjectCard r={radius.xl} style={{ padding: 16, gap: 9 }}>
            <T size={11} weight="bold" c={color.gold} ls={0.8}>NOT WRITTEN YET</T>
            <T size={15} weight="bold">{node.title}</T>
            <T size={12.5} lh={19} c={color.muted}>
              {node.subtitle}
            </T>
            <T size={12.5} lh={19} c={color.muted}>
              This lesson is planned — {node.minutes} minutes inside{' '}
              {day ? `Day ${day.index}, ${day.title}` : 'the programme'} — but its content has not
              been authored, so there is nothing here to teach you yet.
            </T>
          </ObjectCard>
          <Button label="Back to the Path" onPress={backToPath} />
        </ScrollView>
      </Screen>
    );
  }

  /**
   * THE RUNNER DOES NOT MOUNT UNTIL THE PROFILE IS READ, and that is not a
   * loading spinner for its own sake.
   *
   * The runner takes its resume point ONCE, from the checkpoint the store
   * holds (audit F11). On a cold start the store is still fetching, so a runner
   * mounted a frame early would read an empty checkpoint, decide the member is
   * on screen one, and then write that over the real one on the first tap —
   * which is worse than not having resume at all, because it silently destroys
   * the thing it was built to protect.
   */
  if (!ready) {
    return (
      <Screen variant="corner" testID="screen-training-lesson">
        {header}
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <T size={12.5} c={color.muted}>Finding where you left off…</T>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen variant="corner" testID="screen-training-lesson">
      {header}
      <LessonRunner
        node={node}
        content={content}
        onExit={backToPath}
        onNextLesson={async (nextLessonId) => {
          if (!nextLessonId) return backToPath();
          const next = lessonNodeById(nextLessonId);
          await setCurrentLesson(nextLessonId);
          // A "next lesson" that has not been written is a dead end, so the
          // member is returned to the path rather than into an apology screen.
          if (next?.hasContent) router.replace(`/training/${nextLessonId}` as never);
          else backToPath();
        }}
      />
    </Screen>
  );
}
